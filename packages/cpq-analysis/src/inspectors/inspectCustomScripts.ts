import type { Connection } from "jsforce";

function meta(source: "salesforce" = "salesforce") {
  return { requestId: crypto.randomUUID(), durationMs: 0, source };
}

function escapeSoql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapeSoqlLike(value: string): string {
  return escapeSoql(value).replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export interface CustomScriptSummary {
  id: string;
  name: string;
  codeLength: number;
  codePreview: string;
}

export interface InspectCustomScriptsData {
  customScripts: CustomScriptSummary[];
}

export type InspectCustomScriptsResult =
  | { ok: true; data: InspectCustomScriptsData; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const inspectCustomScriptsTool = {
  name: "inspect_custom_scripts",
  title: "Inspect Custom Scripts",
  description: "Inventories SBQQ CPQ Quote Calculator Plugin (QCP) custom scripts — the object holding arbitrary custom JavaScript pricing logic with no direct Revenue Cloud equivalent. Returns a preview only, not full code. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

export async function inspectCustomScriptsHandler(conn: Connection, input: Record<string, never>): Promise<InspectCustomScriptsResult> {
  try {
    const result = await conn.query<any>(`SELECT Id, Name, SBQQ__Code__c FROM SBQQ__CustomScript__c ORDER BY Name ASC LIMIT 20`);

    const customScripts: CustomScriptSummary[] = result.records.map((r) => ({
      id: r.Id,
      name: r.Name,
      codeLength: (r.SBQQ__Code__c ?? "").length,
      codePreview: (r.SBQQ__Code__c ?? "").slice(0, 500),
    }));

    const data: InspectCustomScriptsData = { customScripts };

    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
