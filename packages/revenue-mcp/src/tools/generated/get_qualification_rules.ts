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

export interface QualificationRule {
  id: string;
  isQualified: boolean;
  effectiveFromDate: string | null;
  effectiveToDate: string | null;
  productId: string | null;
  rootProductId: string | null;
  parentProductId: string | null;
}

export interface QualificationRulesMeta {
  requestId: string;
  durationMs: number;
  source: "salesforce";
}

export interface QualificationRulesSuccess {
  ok: true;
  data: QualificationRule[];
  meta: QualificationRulesMeta;
}

export interface QualificationRulesFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  meta: QualificationRulesMeta;
}

export type getQualificationRulesResult = QualificationRulesSuccess | QualificationRulesFailure;

export const getQualificationRulesTool = {
  name: "get_qualification_rules",
  title: "Get Qualification Rules",
  description: "Lists ProductQualification rows where the given product is the ProductId, RootProductId, or ParentProductId. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      productId: { type: "string", description: "The product id to look up qualification rules for (matched against ProductId, RootProductId, or ParentProductId)." },
    },
    required: ["productId"],
  },
};

export async function getQualificationRulesHandler(conn: Connection, input: { productId: string }): Promise<getQualificationRulesResult> {
  try {
    const escaped = escapeSoql(input.productId);
    const soql = `SELECT Id, IsQualified, EffectiveFromDate, EffectiveToDate, ProductId, RootProductId, ParentProductId FROM ProductQualification WHERE ProductId = '${escaped}' OR RootProductId = '${escaped}' OR ParentProductId = '${escaped}'`;
    const records = await conn.query<any>(soql);
    const data: QualificationRule[] = records.records.map((r: any) => ({
      id: r.Id,
      isQualified: r.IsQualified ?? false,
      effectiveFromDate: r.EffectiveFromDate ?? null,
      effectiveToDate: r.EffectiveToDate ?? null,
      productId: r.ProductId ?? null,
      rootProductId: r.RootProductId ?? null,
      parentProductId: r.ParentProductId ?? null,
    }));
    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
