import type {
  AdapterResult,
  ConfigurationChange,
  ConfigurationState,
  PricingState,
  QuoteResult,
  RevenueConfigurator,
  ValidationResult,
} from "@revenue-picker/core";
import type { ConfiguratorComponent, ConfiguratorMessage } from "./client";
import type { BridgeChange, BridgePricingResult, BridgeStateResult, RevenuePickerBridge } from "./bridge";
import { mapToConfigurationState } from "./mapping";

function parseSessionId(sessionId: string): { quoteId: string; rootLineId: string } {
  const [quoteId, rootLineId] = sessionId.split(":");
  if (!quoteId || !rootLineId) throw new Error(`Malformed session id: ${sessionId}`);
  return { quoteId, rootLineId };
}

function err(code: string, message: string, retryable = false): { ok: false; error: { code: string; message: string; retryable: boolean } } {
  return { ok: false, error: { code, message, retryable } };
}

/** A domain change in the flat shape the Apex methods take. */
function toBridgeChange(change: ConfigurationChange): BridgeChange {
  const c: BridgeChange = { changeType: change.type, groupId: null, optionId: null, attributeId: null, value: null, quantity: null };
  if (change.type === "select-option" || change.type === "deselect-option") {
    c.groupId = change.groupId;
    c.optionId = change.optionId;
  } else if (change.type === "set-attribute") {
    c.groupId = change.groupId;
    c.optionId = change.optionId;
    c.attributeId = change.attributeId;
    c.value = change.value === null ? null : String(change.value);
  } else if (change.type === "set-quantity") {
    c.groupId = change.groupId;
    c.optionId = change.optionId;
    c.quantity = change.quantity;
  }
  return c;
}

function flattenMessages(messages: Record<string, ConfiguratorMessage[]> | undefined): ConfiguratorMessage[] {
  if (!messages) return [];
  return Object.entries(messages).flatMap(([recordId, list]) => list.map((m) => ({ ...m, relatedRecordId: m.relatedRecordId ?? recordId })));
}

function toState(quoteId: string, result: BridgeStateResult, cachedCatalog?: string): ConfigurationState {
  const catalogJson = result.configureJson ?? cachedCatalog;
  if (!catalogJson) throw new Error(`No catalog available for line ${result.rootLineId}.`);
  const parsed = JSON.parse(catalogJson) as {
    catalogProducts: ConfiguratorComponent[];
    messages?: Record<string, ConfiguratorMessage[]>;
  };
  const catalogRoot = parsed.catalogProducts[0];
  if (!catalogRoot) throw new Error(`configure returned no catalog data for line ${result.rootLineId}.`);

  const existingLines = result.lines.map((l) => ({ id: l.Id, product2Id: l.Product2Id, quantity: l.Quantity }));
  const relationships = result.relationships.map((r) => ({
    id: r.Id,
    mainQuoteLineId: r.MainQuoteLineId,
    associatedQuoteLineId: r.AssociatedQuoteLineId,
    productRelatedComponentId: r.ProductRelatedComponentId,
  }));
  const attributes = result.attributes.map((a) => ({
    id: a.Id,
    quoteLineItemId: a.QuoteLineItemId,
    attributeDefinitionId: a.AttributeDefinitionId,
    attributeValue: a.AttributeValue,
  }));
  const messages = flattenMessages(parsed.messages);

  return mapToConfigurationState(quoteId, result.rootLineId, catalogRoot, existingLines, relationships, attributes, messages);
}

/** Runs Place Sales Transaction through the signed-in user's Apex bridge; no REST proxy or guest credentials. */
export class BridgeRevenueAdapter implements RevenueConfigurator {
  private bridge: RevenuePickerBridge;
  /** Catalogs already fetched, by root line. Reopening a bundle then costs no round trip at all. */
  private catalogs = new Map<string, string>();
  /** Prices that arrived with the last change response, so getPricing doesn't make its own trip. */
  private pricing = new Map<string, BridgePricingResult>();
  /** The last state we handed out, used for the completeness half of validation. */

  constructor(bridge: RevenuePickerBridge) {
    this.bridge = bridge;
  }

  private capture(quoteId: string, result: BridgeStateResult): ConfigurationState {
    const sessionId = `${quoteId}:${result.rootLineId}`;
    if (result.configureJson) this.catalogs.set(result.rootLineId, result.configureJson);
    if (result.pricing) this.pricing.set(sessionId, result.pricing);
    const state = toState(quoteId, result, this.catalogs.get(result.rootLineId));
    return state;
  }

  async startSession(input: {
    accountId?: string;
    quoteId?: string;
    productId: string;
    transactionType?: string;
  }): Promise<AdapterResult<ConfigurationState>> {
    try {
      if (!input.quoteId) return err("MISSING_QUOTE_ID", "This adapter configures an existing Quote -- quoteId is required.");
      const quoteId = input.quoteId;
      if (this.bridge.startSession) {
        return { ok: true, data: this.capture(quoteId, await this.bridge.startSession(quoteId, input.productId)) };
      }
      const rootLineId = await this.bridge.ensureRootLine(quoteId, input.productId);
      return { ok: true, data: this.capture(quoteId, await this.bridge.getState(quoteId, rootLineId)) };
    } catch (e) {
      return this.toError(e);
    }
  }

  async getState(sessionId: string): Promise<AdapterResult<ConfigurationState>> {
    try {
      const { quoteId, rootLineId } = parseSessionId(sessionId);
      const result = await this.bridge.getState(quoteId, rootLineId);
      return { ok: true, data: this.capture(quoteId, result) };
    } catch (e) {
      return this.toError(e);
    }
  }

  async applyChange(sessionId: string, change: ConfigurationChange): Promise<AdapterResult<ConfigurationState>> {
    try {
      const { quoteId, rootLineId } = parseSessionId(sessionId);
      const { groupId, optionId, attributeId, value, quantity } = toBridgeChange(change);

      if (this.bridge.applyChangeAndGetState) {
        const result = await this.bridge.applyChangeAndGetState(
          quoteId,
          rootLineId,
          change.type,
          groupId,
          optionId,
          attributeId,
          value,
          quantity,
          !this.catalogs.has(rootLineId)
        );
        return { ok: true, data: this.capture(quoteId, result) };
      }
      await this.bridge.applyChange(quoteId, rootLineId, change.type, groupId, optionId, attributeId, value, quantity);
      const result = await this.bridge.getState(quoteId, rootLineId);
      return { ok: true, data: this.capture(quoteId, result) };
    } catch (e) {
      return this.toError(e);
    }
  }

  async applyChanges(sessionId: string, changes: ConfigurationChange[]): Promise<AdapterResult<ConfigurationState>> {
    if (changes.length === 0) return this.getState(sessionId);
    if (changes.length === 1 || !this.bridge.applyChangesAndGetState) {
      let last: AdapterResult<ConfigurationState> | null = null;
      for (const change of changes) {
        last = await this.applyChange(sessionId, change);
        if (!last.ok) return last;
      }
      return last!;
    }
    try {
      const { quoteId, rootLineId } = parseSessionId(sessionId);
      const result = await this.bridge.applyChangesAndGetState(
        quoteId,
        rootLineId,
        changes.map(toBridgeChange),
        !this.catalogs.has(rootLineId)
      );
      return { ok: true, data: this.capture(quoteId, result) };
    } catch (e) {
      return this.toError(e);
    }
  }

  async completeGroup(sessionId: string, groupId: string): Promise<AdapterResult<ConfigurationState>> {
    const result = await this.getState(sessionId);
    if (!result.ok) return result;
    const group = result.data.groups.find((g) => g.id === groupId);
    if (!group) return err("UNKNOWN_GROUP", `Unknown group ${groupId}`);
    if (group.status === "locked") return err("GROUP_LOCKED", `${group.label} is not yet available -- complete prior groups first.`);
    return result;
  }

  async getPricing(sessionId: string): Promise<AdapterResult<PricingState>> {
    try {
      const { quoteId, rootLineId } = parseSessionId(sessionId);
      // startSession and applyChange already returned the engine's prices; only fetch when they didn't.
      const cached = this.pricing.get(sessionId);
      if (cached) this.pricing.delete(sessionId);
      const result = cached ?? (await this.bridge.getPricing(quoteId, rootLineId));
      return {
        ok: true,
        data: {
          sessionId,
          lineItems: result.lineItems.map((li) => ({
            lineId: li.lineId,
            optionId: li.productId,
            productName: li.productId,
            quantity: li.quantity,
            unitPrice: li.unitPrice.toFixed(2),
            extendedPrice: li.extendedPrice.toFixed(2),
          })),
          totalPrice: result.totalPrice.toFixed(2),
          currencyIsoCode: result.currencyIsoCode ?? "USD",
          calculatedAt: new Date().toISOString(),
        },
      };
    } catch (e) {
      return this.toError(e);
    }
  }

  async validateTransaction(sessionId: string): Promise<AdapterResult<ValidationResult>> {
    try {
      const { quoteId, rootLineId } = parseSessionId(sessionId);

      // Read current persisted lines together with the engine verdict. Cached completeness
      // cannot validate edits made in another tab or the standard quote line editor.
      const result = await this.bridge.validateTransaction(quoteId, rootLineId);
      const parsed = JSON.parse(result.configureJson ?? this.catalogs.get(rootLineId) ?? "{}") as {
        success: boolean;
        errors: Array<{ message: string }>;
        messages?: Record<string, ConfiguratorMessage[]>;
      };
      const messages = flattenMessages(parsed.messages);
      const blocking = messages.filter((m) => m.messageType === "error" || m.messageType === "warning");
      const state = this.capture(quoteId, result);

      const valid = parsed.success && parsed.errors.length === 0 && blocking.length === 0 && state.isComplete;
      return {
        ok: true,
        data: {
          sessionId,
          valid,
          validatedAt: new Date().toISOString(),
          issues: [
            ...parsed.errors.map((e) => ({ message: e.message })),
            ...blocking.map((m) => ({ message: m.message })),
            ...(!state.isComplete ? state.groups.filter((g) => g.status !== "complete").map((g) => ({ groupId: g.id, message: `${g.label} is not complete.` })) : []),
          ],
        },
      };
    } catch (e) {
      return this.toError(e);
    }
  }

  async createQuote(sessionId: string): Promise<AdapterResult<QuoteResult>> {
    try {
      const { quoteId } = parseSessionId(sessionId);
      const [summary, pricing] = await Promise.all([this.bridge.getQuoteSummary(quoteId), this.getPricing(sessionId)]);
      if (!pricing.ok) return pricing;
      if (typeof summary.totalPrice !== "number" || !Number.isFinite(summary.totalPrice)) {
        return err("PRICE_UNAVAILABLE", "Quote total unavailable. Reload the Quote page and validate again.");
      }
      return {
        ok: true,
        data: {
          quoteId: summary.id,
          quoteNumber: summary.quoteNumber,
          status: summary.status,
          totalPrice: summary.totalPrice.toFixed(2),
        },
      };
    } catch (e) {
      return this.toError(e);
    }
  }

  private toError(e: unknown): { ok: false; error: { code: string; message: string; retryable: boolean } } {
    if (e instanceof Error) return err("UNEXPECTED_ERROR", e.message);
    return err("UNEXPECTED_ERROR", String(e));
  }
}
