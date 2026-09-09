import type { Connection } from "jsforce";
import { inspectPriceRulesTool, inspectPriceRulesHandler } from "./inspectors/inspectPriceRules";
import { inspectDiscountSchedulesTool, inspectDiscountSchedulesHandler } from "./inspectors/inspectDiscountSchedules";
import { inspectProductRulesTool, inspectProductRulesHandler } from "./inspectors/inspectProductRules";
import { inspectCustomScriptsTool, inspectCustomScriptsHandler } from "./inspectors/inspectCustomScripts";
import { inspectCatalogStructureTool, inspectCatalogStructureHandler } from "./inspectors/inspectCatalogStructure";
import { detectTwinFieldsTool, detectTwinFieldsHandler } from "./inspectors/detectTwinFields";

export * from "./inspectors/inspectPriceRules";
export * from "./inspectors/inspectDiscountSchedules";
export * from "./inspectors/inspectProductRules";
export * from "./inspectors/inspectCustomScripts";
export * from "./inspectors/inspectCatalogStructure";
export * from "./inspectors/detectTwinFields";

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
];
