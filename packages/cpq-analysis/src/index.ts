import type { Connection } from "jsforce";
import { inspectPriceRulesTool, inspectPriceRulesHandler } from "./inspectors/inspectPriceRules";
import { inspectDiscountSchedulesTool, inspectDiscountSchedulesHandler } from "./inspectors/inspectDiscountSchedules";
import { inspectProductRulesTool, inspectProductRulesHandler } from "./inspectors/inspectProductRules";
import { inspectCustomScriptsTool, inspectCustomScriptsHandler } from "./inspectors/inspectCustomScripts";
import { inspectCatalogStructureTool, inspectCatalogStructureHandler } from "./inspectors/inspectCatalogStructure";
import { detectTwinFieldsTool, detectTwinFieldsHandler } from "./inspectors/detectTwinFields";
import { inspectInstalledBaseTool, inspectInstalledBaseHandler } from "./inspectors/inspectInstalledBase";
import { inspectSellingModelTool, inspectSellingModelHandler } from "./inspectors/inspectSellingModel";
import { inspectQuoteUsageTool, inspectQuoteUsageHandler } from "./inspectors/inspectQuoteUsage";
import { inspectAutomationScannerTool, inspectAutomationScannerHandler } from "./inspectors/inspectAutomationScanner";
import { inspectCustomFieldsTool, inspectCustomFieldsHandler } from "./inspectors/inspectCustomFields";
import { inspectIntegrationsTool, inspectIntegrationsHandler } from "./inspectors/inspectIntegrations";
import { inspectReportingImpactTool, inspectReportingImpactHandler } from "./inspectors/inspectReportingImpact";

export * from "./inspectors/inspectPriceRules";
export * from "./inspectors/inspectDiscountSchedules";
export * from "./inspectors/inspectProductRules";
export * from "./inspectors/inspectCustomScripts";
export * from "./inspectors/inspectCatalogStructure";
export * from "./inspectors/detectTwinFields";
export * from "./inspectors/inspectInstalledBase";
export * from "./inspectors/inspectSellingModel";
export * from "./inspectors/inspectQuoteUsage";
export * from "./inspectors/inspectAutomationScanner";
export * from "./inspectors/inspectCustomFields";
export * from "./inspectors/inspectIntegrations";
export * from "./inspectors/inspectReportingImpact";

// Each report module independently declares its own local `InspectorResult` type (they are
// structurally identical, but distinct declarations) -- so these are re-exported by name rather
// than via `export *`, which would otherwise collide (TS2308) on that shared type name.
export type { RcMapping, RcMappingCategory } from "./report/rcMappings";
export { RC_MAPPINGS } from "./report/rcMappings";

export type { InspectorResult } from "./report/buildInventorySection";
export { buildInventorySection } from "./report/buildInventorySection";

export { scoreComplexity } from "./report/scoreComplexity";
export { buildSequencingSection } from "./report/buildSequencingSection";

export * from "./report/assessmentTypes";
export { buildDispositions } from "./report/buildDispositions";
export type { DimensionScore, ReadinessResult } from "./report/buildReadinessScore";
export { buildReadinessScore } from "./report/buildReadinessScore";
export { buildExecutiveSummary } from "./report/buildExecutiveSummary";
export { buildInstalledBaseSection } from "./report/buildInstalledBaseSection";
export type { SellingModelClassification, ProductSellingModelClassification, SellingModelCounts } from "./report/buildSellingModelSection";
export { classifySellingModels, buildSellingModelSection } from "./report/buildSellingModelSection";
export { buildUsageAnalyticsSection } from "./report/buildUsageAnalyticsSection";
export { buildAutomationScannerSection } from "./report/buildAutomationScannerSection";
export { buildCustomFieldSection } from "./report/buildCustomFieldSection";
export { buildIntegrationsSection } from "./report/buildIntegrationsSection";
export { buildReportingImpactSection } from "./report/buildReportingImpactSection";
export { buildDependencyGraphSection } from "./report/buildDependencyGraphSection";
export { buildTestingCutoverSection } from "./report/buildTestingCutoverSection";

export type { AssembleReportResult } from "./report/assembleReport";
export { assembleReport } from "./report/assembleReport";

type JsonProperty = { type: string; description?: string };
type InspectorTool = {
  name: string;
  title: string;
  description: string;
  kind: "read";
  inputSchema: { type: string; properties: Record<string, JsonProperty>; required: string[] };
};
type InspectorHandler = (connection: Connection, input: any) => Promise<any>;

export interface CpqInspector {
  tool: InspectorTool;
  handler: InspectorHandler;
}

export const cpqInspectors: CpqInspector[] = [
  { tool: inspectPriceRulesTool, handler: inspectPriceRulesHandler },
  { tool: inspectDiscountSchedulesTool, handler: inspectDiscountSchedulesHandler },
  { tool: inspectProductRulesTool, handler: inspectProductRulesHandler },
  { tool: inspectCustomScriptsTool, handler: inspectCustomScriptsHandler },
  { tool: inspectCatalogStructureTool, handler: inspectCatalogStructureHandler },
  { tool: detectTwinFieldsTool, handler: detectTwinFieldsHandler },
  { tool: inspectInstalledBaseTool, handler: inspectInstalledBaseHandler },
  { tool: inspectSellingModelTool, handler: inspectSellingModelHandler },
  { tool: inspectQuoteUsageTool, handler: inspectQuoteUsageHandler },
  { tool: inspectAutomationScannerTool, handler: inspectAutomationScannerHandler },
  { tool: inspectCustomFieldsTool, handler: inspectCustomFieldsHandler },
  { tool: inspectIntegrationsTool, handler: inspectIntegrationsHandler },
  { tool: inspectReportingImpactTool, handler: inspectReportingImpactHandler },
];
