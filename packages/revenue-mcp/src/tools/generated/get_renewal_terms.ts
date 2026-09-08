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

export interface RenewalTerm {
  id: string;
  assetActionNumber: string | null;
  assetId: string;
  type: string | null;
  categoryEnum: string | null;
  actionDate: string | null;
  productAmountChange: number | null;
  quantityChange: number | null;
  amount: number | null;
  totalAmount: number | null;
}

export interface RenewalTermsMeta {
  requestId: string;
  durationMs: number;
  source: "salesforce";
}

export interface RenewalTermsSuccess {
  ok: true;
  data: RenewalTerm[];
  meta: RenewalTermsMeta;
}

export interface RenewalTermsFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  meta: RenewalTermsMeta;
}

export type getRenewalTermsResult = RenewalTermsSuccess | RenewalTermsFailure;

export const getRenewalTermsTool = {
  name: "get_renewal_terms",
  title: "Get Renewal Terms",
  description: "Lists AssetAction records for a given asset, optionally filtered to a specific Type value representing renewals. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      assetId: { type: "string", description: "The Id of the Asset whose renewal AssetAction records should be listed." },
    },
    required: ["assetId"],
  },
};

export async function getRenewalTermsHandler(conn: Connection, input: { assetId: string }): Promise<getRenewalTermsResult> {
  try {
    const soql = `SELECT Id, AssetActionNumber, AssetId, Type, CategoryEnum, ActionDate, ProductAmountChange, QuantityChange, Amount, TotalAmount FROM AssetAction WHERE AssetId = '${escapeSoql(input.assetId)}' AND CategoryEnum = 'Renewals' ORDER BY ActionDate DESC NULLS LAST`;
    const records = await conn.query<any>(soql);
    const data: RenewalTerm[] = records.records.map((r: any) => ({
      id: r.Id,
      assetActionNumber: r.AssetActionNumber ?? null,
      assetId: r.AssetId,
      type: r.Type ?? null,
      categoryEnum: r.CategoryEnum ?? null,
      actionDate: r.ActionDate ?? null,
      productAmountChange: r.ProductAmountChange ?? null,
      quantityChange: r.QuantityChange ?? null,
      amount: r.Amount ?? null,
      totalAmount: r.TotalAmount ?? null,
    }));
    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
