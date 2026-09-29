import type {
  AdapterResult,
  ConfigurationChange,
  ConfigurationState,
  PricingState,
  QuoteResult,
  ValidationResult,
} from "./types";

/**
 * The one seam between this project and Revenue Cloud (or a mock).
 *
 * Every method returns the full authoritative ConfigurationState (where relevant) so the
 * renderer never has to locally reconcile a partial response -- Salesforce's answer replaces
 * the UI's belief about what's valid, not merges with it.
 */
export interface RevenueConfigurator {
  startSession(input: {
    accountId?: string;
    quoteId?: string;
    productId: string;
    transactionType?: string;
  }): Promise<AdapterResult<ConfigurationState>>;

  getState(sessionId: string): Promise<AdapterResult<ConfigurationState>>;

  applyChange(sessionId: string, change: ConfigurationChange): Promise<AdapterResult<ConfigurationState>>;

  /**
   * Applies several changes in one call. Optional: adapters that can't batch simply don't
   * implement it and the caller falls back to one applyChange per change.
   */
  applyChanges?(sessionId: string, changes: ConfigurationChange[]): Promise<AdapterResult<ConfigurationState>>;

  completeGroup(sessionId: string, groupId: string): Promise<AdapterResult<ConfigurationState>>;

  getPricing(sessionId: string): Promise<AdapterResult<PricingState>>;

  validateTransaction(sessionId: string): Promise<AdapterResult<ValidationResult>>;

  createQuote(sessionId: string): Promise<AdapterResult<QuoteResult>>;
}
