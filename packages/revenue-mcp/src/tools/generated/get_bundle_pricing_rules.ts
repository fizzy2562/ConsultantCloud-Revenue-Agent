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

export interface BundlePricingRule {
  id: string;
  name: string;
  attributeCount: number | null;
  usageType: string | null;
}

export interface BundlePricingAdjustment {
  id: string;
  adjustmentType: string | null;
  adjustmentValue: number | null;
  productSellingModelId: string | null;
  productId: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  rule: BundlePricingRule | null;
}

export interface BundlePricingRulesMeta {
  requestId: string;
  durationMs: number;
  source: "salesforce";
}

export interface BundlePricingRulesSuccess {
  ok: true;
  data: BundlePricingAdjustment[];
  meta: BundlePricingRulesMeta;
}

export interface BundlePricingRulesFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  meta: BundlePricingRulesMeta;
}

export type getBundlePricingRulesResult = BundlePricingRulesSuccess | BundlePricingRulesFailure;

export const getBundlePricingRulesTool = {
  name: "get_bundle_pricing_rules",
  title: "Get Bundle Pricing Rules",
  description: "Returns attribute-based price adjustments for a given product, joined with their parent adjustment rule. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      productId: { type: "string", description: "The Id of the product whose attribute-based price adjustment rules and records should be returned." },
    },
    required: ["productId"],
  },
};

export async function getBundlePricingRulesHandler(conn: Connection, input: { productId: string }): Promise<getBundlePricingRulesResult> {
  try {
    const adjustments = await conn.query<any>(`SELECT Id, PriceAdjustmentScheduleId, AdjustmentType, AdjustmentValue, ProductSellingModelId, AttributeBasedAdjRuleId, ProductId, EffectiveFrom, EffectiveTo FROM AttributeBasedAdjustment WHERE ProductId = '${escapeSoql(input.productId)}'`);
    const adjustmentRows = adjustments.records;
    if (adjustmentRows.length === 0) {
      return { ok: true, data: [], meta: meta() };
    }

    const ruleIds = Array.from(new Set(adjustmentRows.map((r: any) => r.AttributeBasedAdjRuleId).filter((id: any): id is string => typeof id === "string" && id.length > 0)));
    let ruleMap: Record<string, BundlePricingRule> = {};
    if (ruleIds.length > 0) {
      const idList = ruleIds.map((id) => `'${escapeSoql(id)}'`).join(", ");
      const rules = await conn.query<any>(`SELECT Id, Name, AttributeCount, UsageType FROM AttributeBasedAdjRule WHERE Id IN (${idList})`);
      for (const r of rules.records) {
        ruleMap[r.Id] = { id: r.Id, name: r.Name ?? "Unknown", attributeCount: r.AttributeCount ?? null, usageType: r.UsageType ?? null };
      }
    }

    const data: BundlePricingAdjustment[] = adjustmentRows.map((r: any) => ({
      id: r.Id,
      adjustmentType: r.AdjustmentType ?? null,
      adjustmentValue: r.AdjustmentValue ?? null,
      productSellingModelId: r.ProductSellingModelId ?? null,
      productId: r.ProductId ?? input.productId,
      effectiveFrom: r.EffectiveFrom ?? null,
      effectiveTo: r.EffectiveTo ?? null,
      rule: (typeof r.AttributeBasedAdjRuleId === "string" && r.AttributeBasedAdjRuleId.length > 0) ? (ruleMap[r.AttributeBasedAdjRuleId] ?? null) : null,
    }));

    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
