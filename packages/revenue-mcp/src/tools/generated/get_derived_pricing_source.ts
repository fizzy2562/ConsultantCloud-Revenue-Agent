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

export interface DerivedPricingSourceRecord {
  id: string;
  name: string | null;
  contributingProductId: string | null;
  pricebookEntryId: string | null;
  derivedPricingScope: string | null;
  formula: string | null;
  pricingSource: string | null;
  productId: string | null;
  productSellingModelId: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface DerivedPricingSourceMeta {
  requestId: string;
  durationMs: number;
  source: "salesforce";
}

export interface DerivedPricingSourceSuccess {
  ok: true;
  data: DerivedPricingSourceRecord[];
  meta: DerivedPricingSourceMeta;
}

export interface DerivedPricingSourceFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  meta: DerivedPricingSourceMeta;
}

export type getDerivedPricingSourceResult = DerivedPricingSourceSuccess | DerivedPricingSourceFailure;

export const getDerivedPricingSourceTool = {
  name: "get_derived_pricing_source",
  title: "Get Derived Pricing Source",
  description: "Returns PriceBookEntryDerivedPrice records for a given product (its derived-pricing source/formula configuration). Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      productId: { type: "string", description: "The Id of the product whose derived-pricing source/formula records should be returned." },
    },
    required: ["productId"],
  },
};

export async function getDerivedPricingSourceHandler(conn: Connection, input: { productId: string }): Promise<getDerivedPricingSourceResult> {
  try {
    const records = await conn.query<any>(`SELECT Id, Name, ContributingProductId, PricebookEntryId, DerivedPricingScope, Formula, PricingSource, ProductId, ProductSellingModelId, EffectiveFrom, EffectiveTo FROM PriceBookEntryDerivedPrice WHERE ProductId = '${escapeSoql(input.productId)}'`);
    const data: DerivedPricingSourceRecord[] = records.records.map((r: any) => ({
      id: r.Id,
      name: r.Name ?? null,
      contributingProductId: r.ContributingProductId ?? null,
      pricebookEntryId: r.PricebookEntryId ?? null,
      derivedPricingScope: r.DerivedPricingScope ?? null,
      formula: r.Formula ?? null,
      pricingSource: r.PricingSource ?? null,
      productId: r.ProductId ?? null,
      productSellingModelId: r.ProductSellingModelId ?? null,
      effectiveFrom: r.EffectiveFrom ?? null,
      effectiveTo: r.EffectiveTo ?? null,
    }));
    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
