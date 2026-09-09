import type { Connection } from "jsforce";
import { z } from "zod";
import { explainQuoteLinePriceTool, explainQuoteLinePriceHandler } from "./explain_quote_line_price";
import { getAmendmentDeltaTool, getAmendmentDeltaHandler } from "./get_amendment_delta";
import { getBillingSummaryTool, getBillingSummaryHandler } from "./get_billing_summary";
import { getBundlePricingRulesTool, getBundlePricingRulesHandler } from "./get_bundle_pricing_rules";
import { getCancellationEligibilityTool, getCancellationEligibilityHandler } from "./get_cancellation_eligibility";
import { getContextDefinitionTool, getContextDefinitionHandler } from "./get_context_definition";
import { getContractObligationsTool, getContractObligationsHandler } from "./get_contract_obligations";
import { getContractPricingTool, getContractPricingHandler } from "./get_contract_pricing";
import { getContractStatusTool, getContractStatusHandler } from "./get_contract_status";
import { getDerivedPricingSourceTool, getDerivedPricingSourceHandler } from "./get_derived_pricing_source";
import { getExpressionSetTool, getExpressionSetHandler } from "./get_expression_set";
import { getFulfillmentExceptionsTool, getFulfillmentExceptionsHandler } from "./get_fulfillment_exceptions";
import { getFulfillmentPlanTool, getFulfillmentPlanHandler } from "./get_fulfillment_plan";
import { getPriceAdjustmentScheduleTool, getPriceAdjustmentScheduleHandler } from "./get_price_adjustment_schedule";
import { getPricingProcedureTool, getPricingProcedureHandler } from "./get_pricing_procedure";
import { getProductAttributesTool, getProductAttributesHandler } from "./get_product_attributes";
import { getProductConfigurationTool, getProductConfigurationHandler } from "./get_product_configuration";
import { getProductSellingModelsTool, getProductSellingModelsHandler } from "./get_product_selling_models";
import { getQualificationRulesTool, getQualificationRulesHandler } from "./get_qualification_rules";
import { getQuoteLineDetailTool, getQuoteLineDetailHandler } from "./get_quote_line_detail";
import { getRateCardTool, getRateCardHandler } from "./get_rate_card";
import { getRenewalTermsTool, getRenewalTermsHandler } from "./get_renewal_terms";
import { getRevenueOrderStatusTool, getRevenueOrderStatusHandler } from "./get_revenue_order_status";
import { getSubscriptionPricingDetailTool, getSubscriptionPricingDetailHandler } from "./get_subscription_pricing_detail";
import { listCatalogCategoriesTool, listCatalogCategoriesHandler } from "./list_catalog_categories";
import { listDecisionTablesTool, listDecisionTablesHandler } from "./list_decision_tables";
import { invokeDecisionTableTool, invokeDecisionTableHandler } from "./invoke_decision_table";

type JsonProperty = {
  type?: string;
  description?: string;
  properties?: Record<string, JsonProperty>;
  required?: string[];
  items?: JsonProperty;
};
type DraftTool = { name: string; title: string; description: string; kind: "read"; inputSchema: { properties: Record<string, JsonProperty>; required: string[] } };
type DraftHandler = (connection: Connection, input: any) => Promise<any>;

const pairs: Array<[DraftTool, DraftHandler]> = [
  [explainQuoteLinePriceTool, explainQuoteLinePriceHandler], [getAmendmentDeltaTool, getAmendmentDeltaHandler],
  [getBillingSummaryTool, getBillingSummaryHandler], [getBundlePricingRulesTool, getBundlePricingRulesHandler],
  [getCancellationEligibilityTool, getCancellationEligibilityHandler], [getContextDefinitionTool, getContextDefinitionHandler],
  [getContractObligationsTool, getContractObligationsHandler],
  [getContractPricingTool, getContractPricingHandler], [getContractStatusTool, getContractStatusHandler],
  [getDerivedPricingSourceTool, getDerivedPricingSourceHandler], [getExpressionSetTool, getExpressionSetHandler],
  [getFulfillmentExceptionsTool, getFulfillmentExceptionsHandler], [getFulfillmentPlanTool, getFulfillmentPlanHandler],
  [getPriceAdjustmentScheduleTool, getPriceAdjustmentScheduleHandler], [getPricingProcedureTool, getPricingProcedureHandler],
  [getProductAttributesTool, getProductAttributesHandler], [getProductConfigurationTool, getProductConfigurationHandler],
  [getProductSellingModelsTool, getProductSellingModelsHandler], [getQualificationRulesTool, getQualificationRulesHandler],
  [getQuoteLineDetailTool, getQuoteLineDetailHandler], [getRateCardTool, getRateCardHandler],
  [getRenewalTermsTool, getRenewalTermsHandler], [getRevenueOrderStatusTool, getRevenueOrderStatusHandler],
  [getSubscriptionPricingDetailTool, getSubscriptionPricingDetailHandler], [listCatalogCategoriesTool, listCatalogCategoriesHandler],
  [listDecisionTablesTool, listDecisionTablesHandler],
  [invokeDecisionTableTool, invokeDecisionTableHandler],
];

function propertySchema(property: JsonProperty): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  if (property.type === "array" && property.items) {
    schema = z.array(propertySchema(property.items));
  } else if (property.type === "object" && property.properties) {
    const required = new Set(property.required ?? []);
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [name, child] of Object.entries(property.properties)) {
      const childSchema = propertySchema(child);
      shape[name] = required.has(name) ? childSchema : childSchema.optional();
    }
    schema = z.object(shape).strict();
  } else if (property.type === "number") {
    schema = z.number();
  } else if (property.type === "boolean") {
    schema = z.boolean();
  } else if (property.type === "string") {
    schema = z.string();
  } else {
    schema = z.unknown();
  }
  return property.description ? schema.describe(property.description) : schema;
}

function inputObject(tool: DraftTool): z.AnyZodObject {
  const required = new Set(tool.inputSchema.required);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, property] of Object.entries(tool.inputSchema.properties)) {
    const schema = propertySchema(property);
    shape[name] = required.has(name) ? schema : schema.optional();
  }
  return z.object(shape).strict();
}

export const generatedReadTools = pairs.map(([tool, handler]) => ({ tool, handler, input: inputObject(tool) }));

export const generatedToolDefinitions = Object.fromEntries(generatedReadTools.map(({ tool, input }) => [tool.name, {
  title: tool.title, description: tool.description, kind: "read" as const, input,
  successShape: "Salesforce-backed read result; see the tool's structured response.",
}])) as Record<string, { title: string; description: string; kind: "read"; input: z.AnyZodObject; successShape: string }>;
