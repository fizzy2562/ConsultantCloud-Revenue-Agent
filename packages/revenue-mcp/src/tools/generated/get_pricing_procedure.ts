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

export interface PricingProcedureStep {
  id: string;
  name: string;
  stepType: string | null;
  stage: string | null;
  stageStepSequence: number | null;
  formulaExpressionText: string | null;
  isConditionalStep: boolean;
  decisionTableId: string | null;
}

export interface PricingProcedureVersion {
  id: string;
  versionNumber: number | null;
  rank: number | null;
  isEnabled: boolean;
  startDateTime: string | null;
  endDateTime: string | null;
}

export interface PricingProcedure {
  id: string;
  name: string;
  description: string | null;
  uniqueName: string;
  inputVariablesMetadata: string | null;
  outputVariablesMetadata: string | null;
  version: PricingProcedureVersion | null;
  steps: PricingProcedureStep[];
}

export type getPricingProcedureResult =
  | { ok: true; data: PricingProcedure; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const getPricingProcedureTool = {
  name: "get_pricing_procedure",
  title: "Get Pricing Procedure",
  description: "Inspects a calculation procedure by its uniqueName: returns the procedure's metadata, its enabled version, and that version's steps in order. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      uniqueName: { type: "string", description: "The UniqueName of the calculation procedure to inspect." },
    },
    required: ["uniqueName"],
  },
};

export async function getPricingProcedureHandler(conn: Connection, input: { uniqueName: string }): Promise<getPricingProcedureResult> {
  try {
    const procedureRecords = await conn.query<any>(`SELECT Id, Name, Description, InputVariablesMetadata, OutputVariablesMetadata, UniqueName FROM CalculationProcedure WHERE UniqueName = '${escapeSoql(input.uniqueName)}'`);
    const procedure = procedureRecords.records[0];
    if (!procedure) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Calculation procedure not found", retryable: false }, meta: meta() };
    }

    const versionRecords = await conn.query<any>(`SELECT Id, CalculationProcedureId, IsEnabled, Rank, VersionNumber, StartDateTime, EndDateTime FROM CalculationProcedureVersion WHERE CalculationProcedureId = '${escapeSoql(procedure.Id)}' AND IsEnabled = true ORDER BY Rank ASC NULLS LAST LIMIT 1`);
    const version = versionRecords.records[0] ?? null;

    let steps: PricingProcedureStep[] = [];
    if (version) {
      const stepRecords = await conn.query<any>(`SELECT Id, CalculationProcedureVersionId, Name, StepType, Stage, StageStepSequence, FormulaExpressionText, IsConditionalStep, DecisionTableId FROM CalculationProcedureStep WHERE CalculationProcedureVersionId = '${escapeSoql(version.Id)}' ORDER BY StageStepSequence ASC NULLS LAST`);
      steps = stepRecords.records.map((r: any) => ({
        id: r.Id,
        name: r.Name,
        stepType: r.StepType ?? null,
        stage: r.Stage ?? null,
        stageStepSequence: r.StageStepSequence ?? null,
        formulaExpressionText: r.FormulaExpressionText ?? null,
        isConditionalStep: r.IsConditionalStep ?? false,
        decisionTableId: r.DecisionTableId ?? null,
      }));
    }

    const data: PricingProcedure = {
      id: procedure.Id,
      name: procedure.Name,
      description: procedure.Description ?? null,
      uniqueName: procedure.UniqueName,
      inputVariablesMetadata: procedure.InputVariablesMetadata ?? null,
      outputVariablesMetadata: procedure.OutputVariablesMetadata ?? null,
      version: version
        ? {
            id: version.Id,
            versionNumber: version.VersionNumber ?? null,
            rank: version.Rank ?? null,
            isEnabled: version.IsEnabled ?? false,
            startDateTime: version.StartDateTime ?? null,
            endDateTime: version.EndDateTime ?? null,
          }
        : null,
      steps,
    };

    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
