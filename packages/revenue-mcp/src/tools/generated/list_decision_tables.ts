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

export interface DecisionTableRow {
  id: string;
  masterLabel: string;
  developerName: string;
  description: string | null;
  status: string;
  type: string;
  usageType: string;
}

export interface listDecisionTablesMeta {
  requestId: string;
  durationMs: number;
  source: "salesforce";
}

export interface listDecisionTablesSuccess {
  ok: true;
  data: {
    decisionTables: DecisionTableRow[];
    truncated: boolean;
  };
  meta: listDecisionTablesMeta;
}

export interface listDecisionTablesFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  meta: listDecisionTablesMeta;
}

export type listDecisionTablesResult = listDecisionTablesSuccess | listDecisionTablesFailure;

export const listDecisionTablesTool = {
  name: "list_decision_tables",
  title: "List Decision Tables",
  description: "Lists DecisionTable records, optionally filtered by usageType. Read-only. This object was already confirmed to work via direct query in earlier research.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      usageType: { type: "string", description: "Optional UsageType filter. When omitted, all active decision tables are returned." },
    },
    required: [],
  },
};

export async function listDecisionTablesHandler(conn: Connection, input: { usageType?: string }): Promise<listDecisionTablesResult> {
  try {
    const where = input.usageType ? ` WHERE UsageType = '${escapeSoql(input.usageType)}'` : "";
    const soql = `SELECT Id, MasterLabel, DeveloperName, Description, Status, Type, UsageType FROM DecisionTable${where} LIMIT 26`;
    const records = await conn.query<any>(soql);
    const rows = records.records ?? [];
    const decisionTables: DecisionTableRow[] = rows.slice(0, 25).map((r: any) => ({
      id: r.Id,
      masterLabel: r.MasterLabel,
      developerName: r.DeveloperName,
      description: r.Description ?? null,
      status: r.Status,
      type: r.Type,
      usageType: r.UsageType,
    }));
    return { ok: true, data: { decisionTables, truncated: rows.length > 25 }, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
