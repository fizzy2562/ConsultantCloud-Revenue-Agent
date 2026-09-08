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

export interface FulfillmentPlan {
  id: string;
  name: string | null;
  status: string | null;
  orchestrationName: string | null;
  duration: number | null;
  currentStage: string | null;
  triggeringRecord: string | null;
  workItems: unknown[];
}

export type FulfillmentPlanMeta = { requestId: string; durationMs: number; source: "salesforce" };

export type getFulfillmentPlanResult =
  | { ok: true; data: FulfillmentPlan | null; meta: FulfillmentPlanMeta }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: FulfillmentPlanMeta };

export const getFulfillmentPlanTool = {
  name: "get_fulfillment_plan",
  title: "Get Fulfillment Plan",
  description:
    "Looks up a FlowOrchestrationInstance by its triggering record id and returns its work items. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      triggeringRecordId: { type: "string", description: "The Id of the record that triggered the flow orchestration instance." },
    },
    required: ["triggeringRecordId"],
  },
};

export async function getFulfillmentPlanHandler(
  conn: Connection,
  input: { triggeringRecordId: string }
): Promise<getFulfillmentPlanResult> {
  try {
    const records = await conn.query<any>(
      `SELECT Id, Name, Status, OrchestrationName, Duration, CurrentStage, TriggeringRecord FROM FlowOrchestrationInstance WHERE TriggeringRecord = '${escapeSoql(input.triggeringRecordId)}' ORDER BY CreatedDate DESC LIMIT 1`
    );
    const row = records.records[0];
    if (!row) {
      return { ok: true, data: null, meta: meta() };
    }
    const steps = await conn.query<any>(`SELECT Id FROM FlowOrchestrationStepInstance WHERE OrchestrationInstanceId = '${escapeSoql(row.Id)}'`);
    let workItems: any[] = [];
    if (steps.records.length) {
      const ids = steps.records.map((step: any) => `'${escapeSoql(step.Id)}'`).join(", ");
      const items = await conn.query<any>(`SELECT Id, Name, StepInstanceId, Status, Label, Description, AssigneeId, RelatedRecordId FROM FlowOrchestrationWorkItem WHERE StepInstanceId IN (${ids})`);
      workItems = items.records.map((item: any) => ({ id: item.Id, name: item.Name ?? null, stepInstanceId: item.StepInstanceId, status: item.Status ?? null, label: item.Label ?? null, description: item.Description ?? null, assigneeId: item.AssigneeId ?? null, relatedRecordId: item.RelatedRecordId ?? null }));
    }
    return {
      ok: true,
      data: {
        id: row.Id,
        name: row.Name ?? null,
        status: row.Status ?? null,
        orchestrationName: row.OrchestrationName ?? null,
        duration: row.Duration ?? null,
        currentStage: row.CurrentStage ?? null,
        triggeringRecord: row.TriggeringRecord ?? null,
        workItems,
      },
      meta: meta(),
    };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
