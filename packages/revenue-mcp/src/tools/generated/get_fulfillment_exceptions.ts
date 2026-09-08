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

export interface JeopardyRule {
  id: string;
  name: string;
  stepType: string | null;
  estimatedDuration: number | null;
  estimatedDurationUnit: string | null;
  jeopardyThreshold: number | null;
  jeopardyThresholdUnit: string | null;
}

export interface FalloutRule {
  id: string;
  name: string;
  stepType: string | null;
  errorCode: string | null;
  retryPolicy: string | null;
  retriesAllowed: number | null;
}

export interface FulfillmentExceptionsData {
  jeopardyRules: JeopardyRule[];
  falloutRules: FalloutRule[];
  truncated: boolean;
}

export interface FulfillmentExceptionsMeta {
  requestId: string;
  durationMs: number;
  source: "salesforce";
}

export interface FulfillmentExceptionsSuccess {
  ok: true;
  data: FulfillmentExceptionsData;
  meta: FulfillmentExceptionsMeta;
}

export interface FulfillmentExceptionsFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  meta: FulfillmentExceptionsMeta;
}

export type getFulfillmentExceptionsResult = FulfillmentExceptionsSuccess | FulfillmentExceptionsFailure;

export const getFulfillmentExceptionsTool = {
  name: "get_fulfillment_exceptions",
  title: "Get Fulfillment Exceptions",
  description: "Lists FulfillmentStepJeopardyRule and FulfillmentFalloutRule records, optionally filtered by stepType. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      stepType: { type: "string", description: "Optional step type to filter both jeopardy and fallout rules by." },
    },
    required: [],
  },
};

export async function getFulfillmentExceptionsHandler(
  conn: Connection,
  input: { stepType?: string }
): Promise<getFulfillmentExceptionsResult> {
  try {
    const filter = input.stepType ? ` WHERE StepType = '${escapeSoql(input.stepType)}'` : "";

    const [jeopardyRes, falloutRes] = await Promise.all([
      conn.query<any>(`SELECT Id, Name, StepType, EstimatedDuration, EstimatedDurationUnit, JeopardyThreshold, JeopardyThresholdUnit FROM FulfillmentStepJeopardyRule${filter} LIMIT 26`),
      conn.query<any>(`SELECT Id, Name, StepType, ErrorCode, RetryPolicy, RetriesAllowed FROM FulfillmentFalloutRule${filter} LIMIT 26`),
    ]);

    const jeopardyRows = jeopardyRes.records ?? [];
    const falloutRows = falloutRes.records ?? [];
    const jeopardyRules: JeopardyRule[] = jeopardyRows.slice(0, 25).map((r: any) => ({
      id: r.Id,
      name: r.Name,
      stepType: r.StepType ?? null,
      estimatedDuration: r.EstimatedDuration ?? null,
      estimatedDurationUnit: r.EstimatedDurationUnit ?? null,
      jeopardyThreshold: r.JeopardyThreshold ?? null,
      jeopardyThresholdUnit: r.JeopardyThresholdUnit ?? null,
    }));

    const falloutRules: FalloutRule[] = falloutRows.slice(0, 25).map((r: any) => ({
      id: r.Id,
      name: r.Name,
      stepType: r.StepType ?? null,
      errorCode: r.ErrorCode ?? null,
      retryPolicy: r.RetryPolicy ?? null,
      retriesAllowed: r.RetriesAllowed ?? null,
    }));

    return { ok: true, data: { jeopardyRules, falloutRules, truncated: jeopardyRows.length > 25 || falloutRows.length > 25 }, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
