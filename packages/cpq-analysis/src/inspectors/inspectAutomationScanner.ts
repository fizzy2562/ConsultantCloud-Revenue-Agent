import type { Connection } from "jsforce";

function meta(source: "salesforce" = "salesforce") {
  return { requestId: crypto.randomUUID(), durationMs: 0, source };
}

export interface CustomApexComponent {
  id: string;
  name: string;
  type: "ApexClass" | "ApexTrigger";
  referencesSbqq: boolean;
}

export interface FlowSummary {
  id: string;
  developerName: string;
  namespacePrefix: string | null;
}

export interface AutomationScannerCounts {
  apexClassesTotal: number;
  apexClassesCustom: number;
  apexTriggersTotal: number;
  apexTriggersCustom: number;
  validationRulesTotal: number;
  validationRulesCustom: number;
  flowsTotal: number;
}

export interface InspectAutomationScannerData {
  counts: AutomationScannerCounts;
  customApexComponents: CustomApexComponent[];
  flows: FlowSummary[];
}

export type InspectAutomationScannerResult =
  | { ok: true; data: InspectAutomationScannerData; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const inspectAutomationScannerTool = {
  name: "inspect_automation_scanner",
  title: "Inspect Custom Automation (Apex, Triggers, Validation Rules, Flows)",
  description: "Scans for customer-authored (non-managed-package) Apex classes, Apex triggers, active Validation Rules, and Flows, and flags which custom Apex/trigger source code references SBQQ (CPQ) objects via a substring check. Excludes the CPQ managed package's own internal code. Read-only.",
  kind: "read" as const,
  inputSchema: { type: "object", properties: {}, required: [] },
};

export async function inspectAutomationScannerHandler(conn: Connection, input: Record<string, never>): Promise<InspectAutomationScannerResult> {
  // Managed-package internals (NamespacePrefix = 'SBQQ') are not customer migration risk;
  // a substring check for "SBQQ__" is used instead of MetadataComponentDependency because
  // the latter does not support COUNT() or unfiltered queries in the Tooling API.
  try {
    const [
      apexClassesTotal,
      apexClassesCustom,
      apexTriggersTotal,
      apexTriggersCustom,
      validationRulesTotal,
      validationRulesCustom,
      customApexClasses,
      customApexTriggers,
      flows,
    ] = await Promise.all([
      conn.tooling.query<any>(`SELECT COUNT() FROM ApexClass`),
      conn.tooling.query<any>(`SELECT COUNT() FROM ApexClass WHERE NamespacePrefix = null`),
      conn.tooling.query<any>(`SELECT COUNT() FROM ApexTrigger`),
      conn.tooling.query<any>(`SELECT COUNT() FROM ApexTrigger WHERE NamespacePrefix = null`),
      conn.tooling.query<any>(`SELECT COUNT() FROM ValidationRule`),
      conn.tooling.query<any>(`SELECT COUNT() FROM ValidationRule WHERE NamespacePrefix = null`),
      conn.tooling.query<any>(`SELECT Id, Name, Body FROM ApexClass WHERE NamespacePrefix = null LIMIT 50`),
      conn.tooling.query<any>(`SELECT Id, Name, Body FROM ApexTrigger WHERE NamespacePrefix = null LIMIT 50`),
      conn.tooling.query<any>(`SELECT Id, DeveloperName, NamespacePrefix FROM FlowDefinition LIMIT 200`),
    ]);

    const counts: AutomationScannerCounts = {
      apexClassesTotal: apexClassesTotal.totalSize,
      apexClassesCustom: apexClassesCustom.totalSize,
      apexTriggersTotal: apexTriggersTotal.totalSize,
      apexTriggersCustom: apexTriggersCustom.totalSize,
      validationRulesTotal: validationRulesTotal.totalSize,
      validationRulesCustom: validationRulesCustom.totalSize,
      flowsTotal: flows.totalSize,
    };

    const customApexComponents: CustomApexComponent[] = [
      ...customApexClasses.records.map((r: any) => ({
        id: r.Id,
        name: r.Name,
        type: "ApexClass" as const,
        referencesSbqq: (r.Body ?? "").includes("SBQQ__"),
      })),
      ...customApexTriggers.records.map((r: any) => ({
        id: r.Id,
        name: r.Name,
        type: "ApexTrigger" as const,
        referencesSbqq: (r.Body ?? "").includes("SBQQ__"),
      })),
    ];

    const flowSummaries: FlowSummary[] = flows.records.map((r: any) => ({
      id: r.Id,
      developerName: r.DeveloperName,
      namespacePrefix: r.NamespacePrefix ?? null,
    }));

    const data: InspectAutomationScannerData = {
      counts,
      customApexComponents,
      flows: flowSummaries,
    };

    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
