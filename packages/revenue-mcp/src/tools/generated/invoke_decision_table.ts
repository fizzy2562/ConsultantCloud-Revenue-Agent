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

export interface DecisionTableCondition {
  fieldName: string;
  value: unknown;
  operator?: string;
}

export interface InvokeDecisionTableInput {
  decisionTableId: string;
  conditions: DecisionTableCondition[];
}

export interface DecisionTableOutcome {
  values: Record<string, unknown>;
  [key: string]: unknown;
}

export interface InvokeDecisionTableData {
  outcomeList: DecisionTableOutcome[];
  outcomeType: string | null;
  successStatus: boolean;
  errorCode: string | null;
  errorMessage: string | null;
}

export type InvokeDecisionTableResult =
  | { ok: true; data: InvokeDecisionTableData; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

type DecisionTableApiOutcome = Partial<InvokeDecisionTableData>;
type DecisionTableApiResponse = DecisionTableApiOutcome & { outputs?: DecisionTableApiOutcome[] };

export const invokeDecisionTableTool = {
  name: "invoke_decision_table",
  title: "Invoke Decision Table",
  description: "Evaluates an existing Salesforce Revenue Cloud Decision Table with runtime conditions and returns its outcomes. This lookup is read-only and does not modify the table or source records.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      decisionTableId: { type: "string", description: "The Salesforce DecisionTable.Id to evaluate." },
      conditions: {
        type: "array",
        description: "Runtime lookup conditions. These are sent as one conditionsList group to the Decision Table API.",
        items: {
          type: "object",
          properties: {
            fieldName: { type: "string", description: "Decision Table input field API name." },
            value: { description: "Runtime value, using its correct JSON type." },
            operator: { type: "string", description: "Optional operator override, such as Equals or GreaterOrEqual." },
          },
          required: ["fieldName", "value"],
        },
      },
    },
    required: ["decisionTableId", "conditions"],
  },
};

export async function invokeDecisionTableHandler(
  conn: Connection,
  input: InvokeDecisionTableInput
): Promise<InvokeDecisionTableResult> {
  try {
    // Keep the local escaping helpers aligned with the generated read-tool template.
    // URL encoding, rather than SOQL escaping, is the applicable protection here.
    void escapeSoqlLike;
    const response = await conn.requestPost<DecisionTableApiResponse>(
      `/services/data/v67.0/connect/business-rules/decision-table/lookup/${encodeURIComponent(input.decisionTableId)}`,
      { conditions: [{ conditionsList: input.conditions }] }
    );
    const outcome = response.outputs?.[0] ?? response;
    return {
      ok: true,
      data: {
        outcomeList: outcome.outcomeList ?? [],
        outcomeType: outcome.outcomeType ?? null,
        successStatus: outcome.successStatus ?? false,
        errorCode: outcome.errorCode ?? null,
        errorMessage: outcome.errorMessage ?? null,
      },
      meta: meta(),
    };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
