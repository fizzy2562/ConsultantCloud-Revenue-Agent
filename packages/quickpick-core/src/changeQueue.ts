import type { ConfigurationChange, ConfigurationState } from "./types";
export type FlushResult = { state: ConfigurationState | null; error: string | null };
// Both supported runtimes (browser and Node) expose timers. Keep their opaque handles
// out of the core public API so downstream packages need neither DOM nor Node typings.
interface TimerRuntime {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}
const timers = globalThis as unknown as TimerRuntime;
type Job = { changes: ConfigurationChange[]; resolve: (result: FlushResult) => void };

/** Owns all debounce timers and waiters for exactly one quote/bundle instance. */
export class ChangeQueue {
  private jobs: Job[] = [];
  private timer: unknown = null;
  private running: Promise<FlushResult> | null = null;
  private disposed = false;
  private result: FlushResult;
  constructor(
    initial: ConfigurationState,
    private apply: (changes: ConfigurationChange[]) => Promise<FlushResult>,
    private reconcile: (result: FlushResult, pending: ConfigurationChange[]) => void,
    private pendingChanged: (pending: boolean) => void,
  ) { this.result = {state:initial,error:null}; }
  get pending() { return this.jobs.length > 0 || this.running !== null; }
  enqueue(changes: ConfigurationChange[], delay = 250): Promise<FlushResult> {
    if (this.disposed) return Promise.resolve({state:null,error:"Configuration closed."});
    this.result = {...this.result,error:null};
    this.pendingChanged(true);
    const promise = new Promise<FlushResult>(resolve => {
      const last = this.jobs[this.jobs.length - 1];
      const a = changes[0], b = last?.changes[0];
      if (changes.length === 1 && last?.changes.length === 1 && a?.type === "set-quantity" &&
          b?.type === "set-quantity" && a.groupId === b.groupId && a.optionId === b.optionId) {
        const previous = last.resolve;
        last.changes = changes;
        last.resolve = result => { previous(result); resolve(result); };
      } else this.jobs.push({changes,resolve});
    });
    if (this.timer != null) timers.clearTimeout(this.timer);
    this.timer = timers.setTimeout(() => { this.timer = null; void this.flush(); }, delay);
    return promise;
  }
  flush(): Promise<FlushResult> {
    if (this.timer != null) timers.clearTimeout(this.timer);
    this.timer = null;
    if (this.running) return this.running;
    // Assign the lock before any callbacks or asynchronous work can re-enter flush.
    this.running = Promise.resolve().then(() => this.drain()).finally(() => {
      this.running = null;
      this.pendingChanged(this.jobs.length > 0);
    });
    return this.running;
  }
  private async drain(): Promise<FlushResult> {
    while (this.jobs.length && !this.disposed) {
      const batch: Job[] = [];
      const groups = new Set<string>();
      // Preserve each swap as an atomic job. Sequential edits in the same group cannot
      // be staged against the same persisted snapshot (select -> quantity, or A -> B -> C).
      while (this.jobs.length) {
        const job = this.jobs[0]!;
        if (job.changes.some(c => groups.has(c.groupId))) break;
        this.jobs.shift(); batch.push(job);
        job.changes.forEach(c => groups.add(c.groupId));
      }
      try { this.result = await this.apply(batch.flatMap(j => j.changes)); }
      catch (e) { this.result = {state:this.result.state,error:e instanceof Error ? e.message : String(e)}; }
      if (this.disposed) this.result = {state:null,error:"Configuration closed."};
      if (this.result.error) {
        batch.push(...this.jobs.splice(0));
        if (!this.disposed) this.reconcile(this.result, []);
        batch.forEach(j => j.resolve(this.result));
        return this.result;
      }
      if (!this.disposed) this.reconcile(this.result, this.jobs.flatMap(j => j.changes));
      batch.forEach(j => j.resolve(this.result));
    }
    return this.result;
  }
  dispose(): void {
    this.disposed = true;
    if (this.timer != null) timers.clearTimeout(this.timer);
    this.timer = null;
    this.result = {state:null,error:"Configuration closed."};
    this.jobs.splice(0).forEach(j => j.resolve(this.result));
  }
}
