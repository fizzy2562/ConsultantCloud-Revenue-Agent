/**
 * Shape returned by RevenuePickerController's @AuraEnabled methods (Apex SObject field casing
 * preserved -- Id, Product2Id, etc. -- since that's what LWC's Apex import gives back verbatim).
 * This is the ONLY thing the bridge adapter depends on, so it works identically whether the
 * bridge is backed by real `@salesforce/apex/...` imports (inside the deployed LWC) or a test
 * double (in unit tests).
 */
export interface BridgeQuoteLineItem {
  Id: string;
  Product2Id: string;
  Quantity: number;
}

export interface BridgeRelationship {
  Id: string;
  MainQuoteLineId: string;
  AssociatedQuoteLineId: string;
  ProductRelatedComponentId: string | null;
}

export interface BridgeAttribute {
  Id: string;
  QuoteLineItemId: string;
  AttributeDefinitionId: string;
  AttributeValue: string | null;
}

export interface BridgeStateResult {
  rootLineId: string;
  /**
   * The bundle's catalog. Null on a change response: the catalog only changes when the catalog or
   * its rules change, so the client keeps the one it already has rather than having the server
   * rebuild ~38KB of it after every click.
   */
  configureJson: string | null;
  lines: BridgeQuoteLineItem[];
  relationships: BridgeRelationship[];
  attributes: BridgeAttribute[];
  /** Engine prices, returned with the state so a change costs one round trip instead of two. */
  pricing?: BridgePricingResult;
}

/** One queued change, as applyChangesAndGetState takes them. */
export interface BridgeChange {
  changeType: string;
  groupId: string | null;
  optionId: string | null;
  attributeId: string | null;
  value: string | null;
  quantity: number | null;
}

/** The engine's dry-run verdict on its own, without a catalog rebuild. */
export interface BridgeValidationSummary {
  success: boolean;
  errors: string[];
}

export interface BridgePricingLine {
  lineId?: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  extendedPrice: number;
}

export interface BridgePricingResult {
  lineItems: BridgePricingLine[];
  totalPrice: number;
  currencyIsoCode?: string;
}

export interface BridgeQuoteSummary {
  totalPrice?: number;
  id: string;
  quoteNumber: string;
  status: string;
}

export interface BridgeProduct {
  /** Present only when resuming a persisted bundle instance. */
  rootLineId?: string;
  Id: string;
  Name: string;
  Family: string | null;
  Description: string | null;
}

/**
 * Everything the bridge-based adapter needs from its host. In production this is a thin wrapper
 * around RevenuePickerController's Apex methods, built by the revenuePicker LWC (Apex calls are
 * only importable from genuine LWC-compiled modules, which is why this indirection exists --
 * the React bundle itself is a plain esbuild artifact, not LWC-compiled).
 */
export interface RevenuePickerBridge {
  getActiveBundles(): Promise<BridgeProduct[]>;
  /**
   * DML only (creates the root QuoteLineItem if one doesn't already exist for this product on
   * this quote, otherwise returns the existing one). Deliberately separate from getState:
   * Salesforce disallows an HTTP callout after uncommitted DML in the same transaction
   * (confirmed live -- "You have uncommitted work pending. Please commit or rollback before
   * calling out"), so this and getState must be two separate Apex invocations.
   */
  ensureRootLine(quoteId: string, productId: string): Promise<string>;
  getState(quoteId: string, rootLineId: string): Promise<BridgeStateResult>;
  /** DML only -- same callout-after-DML constraint as ensureRootLine; call getState separately afterward. */
  applyChange(
    quoteId: string,
    rootLineId: string,
    changeType: string,
    groupId: string | null,
    optionId: string | null,
    attributeId: string | null,
    value: string | null,
    quantity: number | null
  ): Promise<void>;
  getPricing(quoteId: string, rootLineId: string): Promise<BridgePricingResult>;
  validateTransaction(quoteId: string, rootLineId: string): Promise<BridgeStateResult>;
  /**
   * Opens a bundle in one round trip (root line + catalog + selection + prices), replacing
   * ensureRootLine -> getState -> getPricing. Optional so older bridges still type-check.
   */
  startSession?(quoteId: string, productId: string): Promise<BridgeStateResult>;
  /** A bundle's catalog on its own, cacheable and keyed by product. */
  getCatalog?(quoteId: string, productId: string): Promise<string>;
  /** Applies a change and returns the resulting selection and prices in the same response. */
  applyChangeAndGetState?(
    quoteId: string,
    rootLineId: string,
    changeType: string,
    groupId: string | null,
    optionId: string | null,
    attributeId: string | null,
    value: string | null,
    quantity: number | null,
    includeCatalog: boolean
  ): Promise<BridgeStateResult>;
  /** Applies several changes in one engine call. */
  applyChangesAndGetState?(
    quoteId: string,
    rootLineId: string,
    changes: BridgeChange[],
    includeCatalog: boolean
  ): Promise<BridgeStateResult>;
  /** The engine dry run, verdict only. */
  validate?(quoteId: string, rootLineId: string): Promise<BridgeValidationSummary>;
  getQuoteSummary(quoteId: string): Promise<BridgeQuoteSummary>;
  /** Active configuration rules that apply to a bundle (Rules Map). Optional so older bridges still type-check. */
  getRules?(productId: string): Promise<BridgeRule[]>;
  /** How each engine price was reached (price breakdown). */
  getPriceBreakdown?(quoteId: string, rootLineId: string): Promise<BridgePriceBreakdown>;
  /** Every bundle on the quote, for the quote overview. */
  getQuoteBundles?(quoteId: string): Promise<BridgeQuoteBundle[]>;
  /** Removes a bundle and its components from the quote. */
  removeBundle?(quoteId: string, rootLineId: string): Promise<void>;
}

export interface BridgeBreakdownStep {
  label: string;
  kind: "discount" | "surcharge" | "included" | "other";
  amount: number;
}

export interface BridgeLineBreakdown {
  lineId: string;
  productId: string;
  productName: string;
  isBundle: boolean;
  quantity: number;
  listUnitPrice: number | null;
  unitPrice: number;
  lineAmount: number;
  steps: BridgeBreakdownStep[];
  netTotal: number;
}

export interface BridgePriceBreakdown {
  lines: BridgeLineBreakdown[];
  lineAmountTotal: number;
  adjustmentTotal: number;
  netTotal: number;
  currencyIsoCode: string;
}

export interface BridgeQuoteBundle {
  rootLineId: string;
  productId: string;
  name: string;
  family: string | null;
  description: string | null;
  quantity: number;
  componentCount: number;
  netTotal: number;
  currencyIsoCode?: string;
}

export interface BridgeRule {
  ruleName: string;
  actionType: string;
  message: string | null;
  messageType: string | null;
  detail: string | null;
  targetComponentIds: string[];
  targetProductIds: string[];
}
