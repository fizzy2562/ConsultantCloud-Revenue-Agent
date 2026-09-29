import type {
  AdapterResult,
  ConfigurationChange,
  ConfigurationState,
  PricingState,
  QuoteResult,
  RevenueConfigurator,
  ValidationResult,
} from "@revenue-picker/core";
import { SalesforceClient, SalesforceRestError, type ConfiguratorComponent, type ConfiguratorMessage } from "./client";
import {
  getAttributePicklistValueId,
  getPricebookEntry,
  getProductRelatedComponent,
  getQuoteLineItemAttributes,
  getQuoteLineItems,
  getQuoteLineRelationships,
  getQuotePricebookId,
} from "./catalogLookup";
import { mapToConfigurationState } from "./mapping";

function parseSessionId(sessionId: string): { quoteId: string; rootLineId: string } {
  const [quoteId, rootLineId] = sessionId.split(":");
  if (!quoteId || !rootLineId) throw new Error(`Malformed session id: ${sessionId}`);
  return { quoteId, rootLineId };
}

function err(code: string, message: string, retryable = false): { ok: false; error: { code: string; message: string; retryable: boolean } } {
  return { ok: false, error: { code, message, retryable } };
}

function flattenMessages(messages: Record<string, ConfiguratorMessage[]>): ConfiguratorMessage[] {
  return Object.entries(messages).flatMap(([recordId, list]) => list.map((m) => ({ ...m, relatedRecordId: m.relatedRecordId ?? recordId })));
}

/**
 * Direct-REST Revenue Cloud adapter -- calls /services/data/... straight from this process
 * using a Bearer session token. Confirmed live to work from Node (see scripts/smoke-test.mjs),
 * but NOT usable from inside a deployed Lightning component: a same-origin fetch() from
 * Lightning Experience does not authenticate against /services/data/... with the browser's own
 * session cookie ("Session expired or invalid", confirmed live). The LWC-hosted app uses
 * BridgeRevenueAdapter (./bridgeAdapter.ts) instead, which routes through Apex. Kept here for
 * Node-side tooling/testing where a real Bearer token is available.
 */
export class DirectRestRevenueAdapter implements RevenueConfigurator {
  private client: SalesforceClient;

  constructor(client: SalesforceClient) {
    this.client = client;
  }

  private async fetchState(quoteId: string, rootLineId: string): Promise<ConfigurationState> {
    const configureResult = await this.client.configuratorConfigure({
      transactionId: quoteId,
      transactionLineId: rootLineId,
      configuratorOptions: {
        executePricing: true,
        returnProductCatalogData: true,
        executeConfigurationRules: true,
        validateProductCatalog: true,
      },
    });
    const catalogRoot = configureResult.catalogProducts[0];
    if (!catalogRoot) throw new Error(`configure returned no catalog data for line ${rootLineId}.`);

    const existingLines = await getQuoteLineItems(this.client, quoteId);
    const relationships = await getQuoteLineRelationships(this.client, rootLineId);
    const childLineIds = existingLines.map((l) => l.id);
    const attributes = await getQuoteLineItemAttributes(this.client, childLineIds);
    const messages = flattenMessages(configureResult.messages ?? {});

    return mapToConfigurationState(quoteId, rootLineId, catalogRoot, existingLines, relationships, attributes, messages);
  }

  /** Finds the child QuoteLineItem for a given catalog product id, within this bundle's relationships. */
  private async findChildLine(quoteId: string, rootLineId: string, productId: string): Promise<{ lineId: string; relationshipId: string } | null> {
    const [existingLines, relationships] = await Promise.all([getQuoteLineItems(this.client, quoteId), getQuoteLineRelationships(this.client, rootLineId)]);
    for (const rel of relationships) {
      if (rel.mainQuoteLineId !== rootLineId) continue;
      const line = existingLines.find((l) => l.id === rel.associatedQuoteLineId);
      if (line?.product2Id === productId) return { lineId: line.id, relationshipId: rel.id };
    }
    return null;
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

      const existingLines = await getQuoteLineItems(this.client, quoteId);
      const relationships = await getQuoteLineRelationships(this.client, quoteId).catch(() => []);
      const childIds = new Set(relationships.map((r) => r.associatedQuoteLineId));
      let rootLine = existingLines.find((l) => l.product2Id === input.productId && !childIds.has(l.id));

      if (!rootLine) {
        const pricebookId = await getQuotePricebookId(this.client, quoteId);
        const pbEntry = await getPricebookEntry(this.client, pricebookId, input.productId);
        const newId = await this.client.sobjectCreate("QuoteLineItem", {
          QuoteId: quoteId,
          Product2Id: input.productId,
          PricebookEntryId: pbEntry.id,
          Quantity: 1,
          UnitPrice: pbEntry.unitPrice,
        });
        rootLine = { id: newId, product2Id: input.productId, quantity: 1 };
      }

      const state = await this.fetchState(quoteId, rootLine.id);
      return { ok: true, data: state };
    } catch (e) {
      return this.toError(e);
    }
  }

  async getState(sessionId: string): Promise<AdapterResult<ConfigurationState>> {
    try {
      const { quoteId, rootLineId } = parseSessionId(sessionId);
      return { ok: true, data: await this.fetchState(quoteId, rootLineId) };
    } catch (e) {
      return this.toError(e);
    }
  }

  async applyChange(sessionId: string, change: ConfigurationChange): Promise<AdapterResult<ConfigurationState>> {
    try {
      const { quoteId, rootLineId } = parseSessionId(sessionId);
      const rootLines = await getQuoteLineItems(this.client, quoteId);
      const rootLine = rootLines.find((l) => l.id === rootLineId);
      if (!rootLine) return err("SESSION_NOT_FOUND", `Root line ${rootLineId} no longer exists on Quote ${quoteId}.`);

      if (change.type === "select-option" || change.type === "deselect-option") {
        const productId = change.optionId;
        if (change.type === "select-option") {
          const existing = await this.findChildLine(quoteId, rootLineId, productId);
          if (!existing) {
            const prc = await getProductRelatedComponent(this.client, rootLine.product2Id, productId, change.groupId);
            const pricebookId = await getQuotePricebookId(this.client, quoteId);
            const pbEntry = await getPricebookEntry(this.client, pricebookId, productId);
            const childLineId = await this.client.sobjectCreate("QuoteLineItem", {
              QuoteId: quoteId,
              Product2Id: productId,
              PricebookEntryId: pbEntry.id,
              Quantity: 1,
              UnitPrice: pbEntry.unitPrice,
            });
            await this.client.sobjectCreate("QuoteLineRelationship", {
              MainQuoteLineId: rootLineId,
              RootQuoteLineId: rootLineId,
              AssociatedQuoteLineId: childLineId,
              ProductRelationshipTypeId: prc.productRelationshipTypeId,
              ProductRelatedComponentId: prc.id,
              AssociatedQuoteLinePricing: prc.doesBundlePriceIncludeChild ? "IncludedInBundlePrice" : "NotIncludedInBundlePrice",
            });
          }
        } else {
          const existing = await this.findChildLine(quoteId, rootLineId, productId);
          if (existing) {
            const attrs = await getQuoteLineItemAttributes(this.client, [existing.lineId]);
            for (const a of attrs) await this.client.sobjectDelete("QuoteLineItemAttribute", a.id);
            await this.client.sobjectDelete("QuoteLineRelationship", existing.relationshipId);
            await this.client.sobjectDelete("QuoteLineItem", existing.lineId);
          }
        }
      } else if (change.type === "set-attribute") {
        const target = await this.findChildLine(quoteId, rootLineId, change.optionId);
        const targetLineId = target?.lineId ?? (rootLine.product2Id === change.optionId ? rootLineId : null);
        if (!targetLineId) return err("UNKNOWN_OPTION", `No selected line found for product ${change.optionId} to set an attribute on.`);

        const value = change.value === null ? null : String(change.value);
        const picklistValueId = value ? await getAttributePicklistValueId(this.client, change.attributeId, value) : null;
        const existingAttrs = await getQuoteLineItemAttributes(this.client, [targetLineId]);
        const existingAttr = existingAttrs.find((a) => a.attributeDefinitionId === change.attributeId);

        if (existingAttr) {
          await this.client.sobjectUpdate("QuoteLineItemAttribute", existingAttr.id, {
            AttributeValue: value,
            ...(picklistValueId ? { AttributePicklistValueId: picklistValueId } : {}),
          });
        } else if (value !== null) {
          await this.client.sobjectCreate("QuoteLineItemAttribute", {
            QuoteLineItemId: targetLineId,
            AttributeDefinitionId: change.attributeId,
            AttributeValue: value,
            ...(picklistValueId ? { AttributePicklistValueId: picklistValueId } : {}),
          });
        }
      } else if (change.type === "set-quantity") {
        const target = await this.findChildLine(quoteId, rootLineId, change.optionId);
        const targetLineId = target?.lineId ?? (rootLine.product2Id === change.optionId ? rootLineId : null);
        if (!targetLineId) return err("UNKNOWN_OPTION", `No selected line found for product ${change.optionId} to set quantity on.`);
        await this.client.sobjectUpdate("QuoteLineItem", targetLineId, { Quantity: change.quantity });
      }

      return { ok: true, data: await this.fetchState(quoteId, rootLineId) };
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
      const lines = await getQuoteLineItems(this.client, quoteId);
      const relationships = await getQuoteLineRelationships(this.client, rootLineId);
      const relevantLineIds = new Set([rootLineId, ...relationships.filter((r) => r.mainQuoteLineId === rootLineId).map((r) => r.associatedQuoteLineId)]);
      const relevantLines = lines.filter((l) => relevantLineIds.has(l.id));

      const pricebookId = await getQuotePricebookId(this.client, quoteId);
      let total = 0;
      const lineItems = [];
      for (const line of relevantLines) {
        const pbEntry = await getPricebookEntry(this.client, pricebookId, line.product2Id).catch(() => null);
        const unitPrice = pbEntry?.unitPrice ?? 0;
        const extended = unitPrice * line.quantity;
        total += extended;
        lineItems.push({ optionId: line.product2Id, productName: line.product2Id, quantity: line.quantity, unitPrice: unitPrice.toFixed(2), extendedPrice: extended.toFixed(2) });
      }

      return {
        ok: true,
        data: { sessionId, lineItems, totalPrice: total.toFixed(2), currencyIsoCode: "USD", calculatedAt: new Date().toISOString() },
      };
    } catch (e) {
      return this.toError(e);
    }
  }

  async validateTransaction(sessionId: string): Promise<AdapterResult<ValidationResult>> {
    try {
      const { quoteId, rootLineId } = parseSessionId(sessionId);
      const configureResult = await this.client.configuratorConfigure({
        transactionId: quoteId,
        transactionLineId: rootLineId,
        configuratorOptions: { executeConfigurationRules: true, validateProductCatalog: true, executePricing: false, returnProductCatalogData: false },
      });
      const messages = flattenMessages(configureResult.messages ?? {});
      const blocking = messages.filter((m) => m.messageType === "error" || m.messageType === "warning");
      const state = await this.fetchState(quoteId, rootLineId);

      const valid = configureResult.success && configureResult.errors.length === 0 && blocking.length === 0 && state.isComplete;
      return {
        ok: true,
        data: {
          sessionId,
          valid,
          validatedAt: new Date().toISOString(),
          issues: [
            ...configureResult.errors.map((e) => ({ message: e.message })),
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
      const rows = await this.client.query<{ Id: string; QuoteNumber: string; Status: string }>(
        `SELECT Id, QuoteNumber, Status FROM Quote WHERE Id = '${quoteId}'`
      );
      const quote = rows[0];
      if (!quote) return err("QUOTE_NOT_FOUND", `Quote ${quoteId} not found.`);
      const pricing = await this.getPricing(sessionId);
      return {
        ok: true,
        data: { quoteId: quote.Id, quoteNumber: quote.QuoteNumber, status: quote.Status, totalPrice: pricing.ok ? pricing.data.totalPrice : "0.00" },
      };
    } catch (e) {
      return this.toError(e);
    }
  }

  private toError(e: unknown): { ok: false; error: { code: string; message: string; retryable: boolean } } {
    if (e instanceof SalesforceRestError) return err(e.code, e.message, e.retryable);
    if (e instanceof Error) return err("UNEXPECTED_ERROR", e.message);
    return err("UNEXPECTED_ERROR", String(e));
  }
}

export type { ConfiguratorComponent };
