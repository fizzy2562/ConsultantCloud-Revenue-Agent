import type { RevenueConfigurator } from "./adapter";
import type { AdapterResult, ConfigurationChange, ConfigurationState, PricingState, QuoteResult, ValidationResult } from "./types";

/** Validation belongs to one session revision, never merely to the last successful response. */
export class ConfigurationSession {
  private sessionId: string | null = null;
  private state: ConfigurationState | null = null;
  private revision = 0;
  private generation = 0;
  private validationRequest = 0;
  private pending = 0;
  private lastValidation: ValidationResult | null = null;
  private validated: { id: string; revision: number; updatedAt: string } | null = null;
  constructor(private adapter: RevenueConfigurator) {}
  get id() { return this.sessionId; }
  get currentState() { return this.state; }
  get currentValidation() { return this.lastValidation; }
  get canSendQuote(): boolean {
    return this.pending === 0 && this.lastValidation?.valid === true && this.validated?.id === this.id &&
      this.validated?.revision === this.revision && this.validated?.updatedAt === this.state?.lastUpdatedAt;
  }
  markDirty(): void {
    this.revision++;
    this.lastValidation = null;
    this.validated = null;
  }
  close(): void {
    this.generation++;
    this.sessionId = null;
    this.state = null;
    this.markDirty();
  }
  private error<T>(message: string, code = "VALIDATION_NOT_CURRENT"): AdapterResult<T> {
    return {ok:false,error:{code,message,retryable:false}};
  }
  private requireId(): string {
    if (!this.id) throw new Error("No active configuration.");
    return this.id;
  }
  private async open(fetch: () => Promise<AdapterResult<ConfigurationState>>) {
    this.close();
    const generation = this.generation;
    const result = await fetch();
    if (generation !== this.generation) return this.error<ConfigurationState>("Configuration changed while opening.", "STALE_SESSION");
    if (result.ok) { this.sessionId = result.data.sessionId; this.state = result.data; }
    return result;
  }
  start(input: Parameters<RevenueConfigurator["startSession"]>[0]) {
    return this.open(() => this.adapter.startSession(input));
  }
  resume(id: string) { return this.open(() => this.adapter.getState(id)); }
  async refresh(): Promise<AdapterResult<ConfigurationState>> {
    const id = this.requireId(), generation = this.generation;
    this.markDirty();
    const result = await this.adapter.getState(id);
    if (generation !== this.generation) return this.error("Configuration changed.", "STALE_SESSION");
    if (result.ok) this.state = result.data;
    return result;
  }
  private async mutate(fn: (id: string) => Promise<AdapterResult<ConfigurationState>>) {
    const id = this.requireId(), generation = this.generation;
    this.markDirty(); this.pending++;
    try {
      const result = await fn(id);
      if (generation !== this.generation) return this.error<ConfigurationState>("Configuration changed.", "STALE_SESSION");
      if (result.ok) this.state = result.data;
      return result;
    } finally { this.pending--; }
  }
  applyChange(change: ConfigurationChange) { return this.mutate(id => this.adapter.applyChange(id, change)); }
  applyChanges(changes: ConfigurationChange[]): Promise<AdapterResult<ConfigurationState>> {
    if (!changes.length) return this.refresh();
    return this.mutate(async id => {
      if (this.adapter.applyChanges) return this.adapter.applyChanges(id, changes);
      let result!: AdapterResult<ConfigurationState>;
      for (const change of changes) {
        result = await this.adapter.applyChange(id, change);
        if (!result.ok) break;
      }
      return result;
    });
  }
  completeGroup(groupId: string) { return this.mutate(id => this.adapter.completeGroup(id, groupId)); }
  getPricing(): Promise<AdapterResult<PricingState>> { return this.adapter.getPricing(this.requireId()); }
  async validateTransaction(_currentState: ConfigurationState): Promise<AdapterResult<ValidationResult>> {
    this.lastValidation = null; this.validated = null;
    const id = this.requireId(), revision = this.revision, generation = this.generation;
    const request = ++this.validationRequest;
    if (this.pending) return this.error("Wait for pending changes before validating.");
    const result = await this.adapter.validateTransaction(id);
    if (generation !== this.generation || revision !== this.revision || request !== this.validationRequest || this.pending) {
      return this.error("Configuration changed during validation. Validate again.");
    }
    if (result.ok && result.data.sessionId === id) {
      this.lastValidation = result.data;
      if (result.data.valid && this.state) this.validated = {id,revision,updatedAt:this.state.lastUpdatedAt};
    }
    return result;
  }
  async createQuote(): Promise<AdapterResult<QuoteResult>> {
    if (!this.canSendQuote) return this.error("Validate the current configuration before confirming the quote.");
    const id = this.requireId(), revision = this.revision, generation = this.generation;
    const result = await this.adapter.createQuote(id);
    if (revision !== this.revision || generation !== this.generation) return this.error("Configuration changed during confirmation.");
    if (!result.ok) this.markDirty();
    return result;
  }
}
