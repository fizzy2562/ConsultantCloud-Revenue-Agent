import type { Connection } from "jsforce";
import { escapeSoql, failure, meta, records, type Result } from "./insight_shared";
import { invokeDecisionTableHandler } from "./invoke_decision_table";

export type DecisionTableExplanation = {
  table: { id: string; name: string; label: string | null; status: string | null; usage: string | null; sourceObject: string | null; sourceFilter: string | null; lastSync: string | null; incrementalSync: boolean | null };
  inputs: Array<{ field: string; operator: string | null; required: boolean }>;
  outputs: string[];
  evaluation: null | { inputsUsed: Record<string, unknown>; missingRequired: string[]; matched: boolean; outcomes: unknown[]; error: string | null };
  explanation: string[];
};

export const explainDecisionTableTool = {
  name: "explain_decision_table",
  title: "Explain Decision Table",
  description:
    "Explains a Revenue Cloud decision table: what it reads (source object and filter), its input conditions (field, operator, required) and outputs, and when its data was last synced. Given inputs, it also runs the table and explains the result: which inputs were used, whether a row matched and what it returned, or which required inputs were missing. Use for 'why did this rule return 15%?' or 'would Acme qualify if quantity was 75?'. Give decisionTable (developer name, label or Id) and optional inputs as {fieldName: value}. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      decisionTable: { type: "string", description: "The decision table's developer name, label or Id (list_decision_tables lists them)." },
      inputs: { type: "object", description: "Optional input values to test, as {fieldName: value}, e.g. {\"Product2Id\": \"01t...\", \"Quantity\": 75}." },
    },
    required: ["decisionTable"],
  },
};

export async function explainDecisionTableHandler(conn: Connection, input: { decisionTable: string; inputs?: Record<string, unknown> }): Promise<Result<DecisionTableExplanation>> {
  try {
    const key = escapeSoql(input.decisionTable);
    const [table] = await records<any>(
      conn,
      `SELECT Id, DeveloperName, MasterLabel, Status, UsageType, SourceObject, SourceConditionLogic, LastSyncDate, IsIncrementalSyncEnabled FROM DecisionTable WHERE Id = '${key.length === 18 || key.length === 15 ? key : "000000000000000"}' OR DeveloperName = '${key}' OR MasterLabel = '${key}' LIMIT 1`
    );
    if (!table) return failure(new Error(`No decision table called "${input.decisionTable}"`), "NOT_FOUND");
    const params = await records<any>(conn, `SELECT FieldName, Operator, Usage, IsRequired, Sequence FROM DecisionTableParameter WHERE DecisionTableId = '${table.Id}' ORDER BY Usage, Sequence`);
    const inputs = params.filter((p) => p.Usage === "INPUT").map((p) => ({ field: p.FieldName as string, operator: (p.Operator as string) ?? null, required: !!p.IsRequired }));
    const outputs = params.filter((p) => p.Usage === "OUTPUT").map((p) => p.FieldName as string);

    const explanation: string[] = [
      `${table.MasterLabel ?? table.DeveloperName} looks up ${outputs.join(", ") || "its outputs"} from ${table.SourceObject ?? "its rows"}${table.SourceConditionLogic ? ` (rows filtered by: ${table.SourceConditionLogic})` : ""}, matching on ${inputs.map((i) => `${i.field} ${i.operator ?? "Equals"}${i.required ? " (required)" : ""}`).join(", ") || "no inputs"}.`,
    ];
    if (table.SourceObject) {
      explanation.push(
        `Its data was last synced ${table.LastSyncDate ? table.LastSyncDate.slice(0, 16).replace("T", " ") : "never"}${table.IsIncrementalSyncEnabled ? ", with incremental sync on" : "; incremental sync is off, so changes to " + table.SourceObject + " since then aren't visible until the next sync"}.`
      );
    }

    let evaluation: DecisionTableExplanation["evaluation"] = null;
    if (input.inputs && Object.keys(input.inputs).length) {
      const known = new Map(inputs.map((i) => [i.field.toLowerCase(), i]));
      const conditions = Object.entries(input.inputs)
        .filter(([field]) => known.has(field.toLowerCase()))
        .map(([field, value]) => ({ fieldName: known.get(field.toLowerCase())!.field, value, ...(known.get(field.toLowerCase())!.operator ? { operator: known.get(field.toLowerCase())!.operator! } : {}) }));
      const ignored = Object.keys(input.inputs).filter((field) => !known.has(field.toLowerCase()));
      const missingRequired = inputs.filter((i) => i.required && !conditions.some((c) => c.fieldName === i.field)).map((i) => i.field);
      if (missingRequired.length) {
        evaluation = { inputsUsed: Object.fromEntries(conditions.map((c) => [c.fieldName, c.value])), missingRequired, matched: false, outcomes: [], error: null };
        explanation.push(`It can't be evaluated without ${missingRequired.join(", ")}.`);
      } else {
        const result = await invokeDecisionTableHandler(conn, { decisionTableId: table.Id, conditions } as any);
        const outcomes = result.ok ? result.data.outcomeList : [];
        const error = result.ok ? result.data.errorMessage : result.error.message;
        evaluation = { inputsUsed: Object.fromEntries(conditions.map((c) => [c.fieldName, c.value])), missingRequired: [], matched: outcomes.length > 0, outcomes, error };
        const used = conditions.map((c) => `${c.fieldName} = ${JSON.stringify(c.value)}`).join(", ");
        if (outcomes.length) explanation.push(`With ${used}, a row matched and returned ${JSON.stringify(outcomes[0])}${outcomes.length > 1 ? ` (and ${outcomes.length - 1} more)` : ""}.`);
        else explanation.push(`With ${used}, no row matched${error ? ` (${error})` : ""}: anything that relies on this table gets no value, which is how a price can come out as 0.`);
      }
      if (ignored.length) explanation.push(`Ignored ${ignored.join(", ")}: not inputs of this table.`);
    }

    return {
      ok: true,
      data: {
        table: {
          id: table.Id,
          name: table.DeveloperName,
          label: table.MasterLabel ?? null,
          status: table.Status ?? null,
          usage: table.UsageType ?? null,
          sourceObject: table.SourceObject ?? null,
          sourceFilter: table.SourceConditionLogic ?? null,
          lastSync: table.LastSyncDate ?? null,
          incrementalSync: table.IsIncrementalSyncEnabled ?? null,
        },
        inputs,
        outputs,
        evaluation,
        explanation,
      },
      meta: meta(),
    };
  } catch (err) {
    return failure(err);
  }
}
