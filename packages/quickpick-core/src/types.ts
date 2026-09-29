/**
 * Domain types for the Revenue Picker core package.
 *
 * These types describe Revenue Cloud's own commercial model (groups, cardinality,
 * pricing, validation) as data -- they never encode business rules themselves.
 * Rules live in Salesforce; this package only shapes what comes back.
 */

export type Cardinality = { min: number; max: number | null };

export type ControlType =
  | "product-choice"
  | "product-multi-select"
  | "quantity"
  | "boolean"
  | "picklist"
  | "numeric"
  | "text"
  | "date"
  | "selling-model"
  | "attribute-selector";

export type GroupStatus = "locked" | "current" | "complete" | "attention";

export interface AttributeValue {
  code: string;
  label: string;
  /** Present when this value is priced independently of the base option (rare, but modeled). */
  priceImpact?: string;
}

export interface ConfigurationAttribute {
  id: string;
  apiName: string;
  label: string;
  controlType: ControlType;
  required: boolean;
  currentValue: string | number | boolean | null;
  /** Valid values for this attribute given everything selected so far -- Revenue Cloud decides this, not the UI. */
  validValues: AttributeValue[] | null;
}

export interface ConfigurationOption {
  id: string;
  productId: string;
  /** Catalog component occurrence; id remains the product id for adapter compatibility. */
  occurrenceId?: string;
  /** Persisted quote-line identity for occurrence-specific prices. */
  lineId?: string;
  name: string;
  description?: string;
  imageUrl?: string;
  selected: boolean;
  required?: boolean;
  attributes: ConfigurationAttribute[];
  /** A Revenue Cloud configuration rule currently blocks choosing this option. */
  disabled?: boolean;
  /** Why the option is disabled, in the rule's own words. */
  notice?: string;
  /** Catalog (price book) unit price, before any adjustments. */
  listPrice?: number;
  /** Current quantity on the quote (selected options). */
  quantity?: number;
  /** The catalog allows changing this component's quantity, within minQuantity..maxQuantity. */
  quantityEditable?: boolean;
  minQuantity?: number;
  maxQuantity?: number;
}

export interface ConfigurationGroup {
  id: string;
  apiName: string;
  label: string;
  sequence: number;
  cardinality: Cardinality;
  status: GroupStatus;
  options: ConfigurationOption[];
}

export interface TransactionContext {
  accountId?: string;
  quoteId?: string;
  transactionType?: string;
  currencyIsoCode?: string;
  region?: string;
  effectiveDate?: string;
}

export interface ConfigurationState {
  sessionId: string;
  rootProductId: string;
  rootProductName: string;
  transactionContext: TransactionContext;
  groups: ConfigurationGroup[];
  /** True once every required group satisfies its cardinality. Drives whether pricing/validation may run. */
  isComplete: boolean;
  /** Revenue Cloud may have already calculated pricing internally -- see PricingState.calculatedAt vs the UI's own decision to display it. */
  lastUpdatedAt: string;
  /** Advisory messages from Revenue Cloud configuration rules that apply to this bundle. */
  notices?: string[];
}

export interface PriceLineItem {
  lineId?: string;
  optionId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  extendedPrice: string;
}

export interface PricingState {
  sessionId: string;
  lineItems: PriceLineItem[];
  totalPrice: string;
  currencyIsoCode: string;
  calculatedAt: string;
}

export interface ValidationIssue {
  groupId?: string;
  optionId?: string;
  message: string;
}

export interface ValidationResult {
  sessionId: string;
  valid: boolean;
  validatedAt: string;
  issues: ValidationIssue[];
}

export interface QuoteResult {
  quoteId: string;
  quoteNumber: string;
  status: string;
  totalPrice: string;
}

export type ConfigurationChange =
  | { type: "select-option"; groupId: string; optionId: string }
  | { type: "deselect-option"; groupId: string; optionId: string }
  | { type: "set-attribute"; groupId: string; optionId: string; attributeId: string; value: string | number | boolean | null }
  | { type: "set-quantity"; groupId: string; optionId: string; quantity: number };

export interface RevenueAdapterError {
  code: string;
  message: string;
  retryable: boolean;
}

export type AdapterResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: RevenueAdapterError };
