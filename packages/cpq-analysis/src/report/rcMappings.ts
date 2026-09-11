export interface RcMapping {
  /** Revenue Cloud target object(s), e.g. "CalculationProcedure -> CalculationProcedureVersion -> CalculationProcedureStep" */
  targetObjects: string;
  /** One sentence describing the migration mechanism. */
  mechanism: string;
}

export type RcMappingCategory =
  | "priceRules"
  | "discountSchedules"
  | "productRulesProductScoped"
  | "productRulesQuoteScoped"
  | "customScripts"
  | "catalogStructure"
  | "twinFields";

export const RC_MAPPINGS: Record<RcMappingCategory, RcMapping> = {
  priceRules: {
    targetObjects: "CalculationProcedure -> CalculationProcedureVersion -> CalculationProcedureStep",
    mechanism: "Re-author each Price Rule's conditions and actions as a declarative pricing step on the Business Rules Engine; condition/action pairs become step conditions and formula outputs.",
  },
  discountSchedules: {
    targetObjects: "PriceAdjustmentSchedule + PriceAdjustmentTier",
    mechanism: "Near-direct structural match — tier boundaries and discount percentages carry over conceptually with the least rework of any category.",
  },
  productRulesProductScoped: {
    targetObjects: "ProductConfigurationRule",
    mechanism: "Rule type/scope/evaluation-event map onto Revenue Cloud's configuration rule model; error messaging is preserved as a qualification/validation outcome.",
  },
  productRulesQuoteScoped: {
    targetObjects: "ProductConfigurationRule (or a DecisionTable / CalculationProcedureStep if the comparison logic is pricing-adjacent); no direct Summary Variable equivalent",
    mechanism: "There is no direct Revenue Cloud object for quote-level validation; the aggregation logic behind a Summary Variable has no named RC counterpart and typically requires a CalculationProcedureStep, DecisionTable, or Apex validation.",
  },
  customScripts: {
    targetObjects: "No object-level equivalent. Logic moves to CalculationProcedureStep (formula-based) or, if genuinely un-expressible declaratively, an Apex-backed pricing callout",
    mechanism: "No Revenue Cloud object equivalent; must be re-implemented as CalculationProcedureStep formulas or an Apex-backed pricing callout. There is no automated conversion path for this category anywhere, commercial or open source.",
  },
  catalogStructure: {
    targetObjects: "Product2 (shared schema) + ProductRelatedComponent bundle structure + ProductAttributeDefinition",
    mechanism: "Catalog and bundle structure is the best-tooled part of any CPQ migration; Options/Features become bundle/related-component structure and Configuration Attributes become ProductAttributeDefinition configuration.",
  },
  twinFields: {
    targetObjects: "Explicit Field Mapping configuration",
    mechanism: "Mechanically simple to migrate (one Field Mapping record per pair) but invisible to any tool that only inspects explicit relationships — must be actively searched for, not assumed absent.",
  },
};
