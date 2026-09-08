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

export interface ExpressionSet {
  id: string;
  developerName: string;
  masterLabel: string | null;
  executionScale: string | null;
  versions: Array<{ id: string; developerName: string; masterLabel: string | null; versionNumber: number | null; status: string | null }>;
}

export type getExpressionSetResult =
  | { ok: true; data: ExpressionSet; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const getExpressionSetTool = {
  name: "get_expression_set",
  title: "Get Expression Set",
  description: "Looks up an ExpressionSetDefinition and its versions by developerName. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      developerName: { type: "string", description: "Developer name of the ExpressionSetDefinition to look up." },
    },
    required: ["developerName"],
  },
};

export async function getExpressionSetHandler(conn: Connection, input: { developerName: string }): Promise<getExpressionSetResult> {
  try {
    const records = await conn.query<any>(`SELECT Id, DeveloperName, MasterLabel, ExecutionScale FROM ExpressionSetDefinition WHERE DeveloperName = '${escapeSoql(input.developerName)}'`);
    const record = records.records[0];
    if (!record) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Expression set definition not found", retryable: false }, meta: meta() };
    }
    const versions = await conn.query<any>(`SELECT Id, DeveloperName, MasterLabel, VersionNumber, Status FROM ExpressionSetDefinitionVersion WHERE ExpressionSetDefinitionId = '${escapeSoql(record.Id)}' ORDER BY VersionNumber DESC`);
    return { ok: true, data: { id: record.Id, developerName: record.DeveloperName, masterLabel: record.MasterLabel ?? null, executionScale: record.ExecutionScale ?? null, versions: versions.records.map((v: any) => ({ id: v.Id, developerName: v.DeveloperName, masterLabel: v.MasterLabel ?? null, versionNumber: v.VersionNumber ?? null, status: v.Status ?? null })) }, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
