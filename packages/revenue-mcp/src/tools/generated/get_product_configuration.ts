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

export interface ProductConfigurationRuleRecord {
  id: string;
  name: string;
  processScope: string | null;
  status: string | null;
  configurationRuleDefinition: string | null;
  ruleType: string | null;
  ruleSubType: string | null;
  sequence: number | null;
  effectiveFromDate: string | null;
  effectiveToDate: string | null;
  apiName: string | null;
}

export interface ProductConfigurationResultData {
  rules: ProductConfigurationRuleRecord[];
  truncated: boolean;
}

export type Meta = { requestId: string; durationMs: number; source: "salesforce" };

export type getProductConfigurationResult =
  | { ok: true; data: ProductConfigurationResultData; meta: Meta }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: Meta };

export const getProductConfigurationTool = {
  name: "get_product_configuration",
  title: "Get Product Configuration",
  description: "Lists ProductConfigurationRule records, optionally filtered by status and/or ruleType. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      status: { type: "string", description: "Optional filter on the Status field of ProductConfigurationRule." },
      ruleType: { type: "string", description: "Optional filter on the RuleType field of ProductConfigurationRule." },
    },
    required: [],
  },
};

export async function getProductConfigurationHandler(
  conn: Connection,
  input: { status?: string; ruleType?: string }
): Promise<getProductConfigurationResult> {
  try {
    const where: string[] = [];
    if (input.status) {
      where.push(`Status = '${escapeSoql(input.status)}'`);
    }
    if (input.ruleType) {
      where.push(`RuleType = '${escapeSoql(input.ruleType)}'`);
    }
    const whereClause = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
    const soql = `SELECT Id, Name, ProcessScope, Status, ConfigurationRuleDefinition, RuleType, RuleSubType, Sequence, EffectiveFromDate, EffectiveToDate, ApiName FROM ProductConfigurationRule${whereClause} ORDER BY Sequence ASC NULLS LAST LIMIT 26`;
    const records = await conn.query<any>(soql);
    const rows = records.records ?? [];
    const rules: ProductConfigurationRuleRecord[] = rows.slice(0, 25).map((r: any) => ({
      id: r.Id,
      name: r.Name,
      processScope: r.ProcessScope ?? null,
      status: r.Status ?? null,
      configurationRuleDefinition: r.ConfigurationRuleDefinition ?? null,
      ruleType: r.RuleType ?? null,
      ruleSubType: r.RuleSubType ?? null,
      sequence: r.Sequence ?? null,
      effectiveFromDate: r.EffectiveFromDate ?? null,
      effectiveToDate: r.EffectiveToDate ?? null,
      apiName: r.ApiName ?? null,
    }));
    return { ok: true, data: { rules, truncated: rows.length > 25 }, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
