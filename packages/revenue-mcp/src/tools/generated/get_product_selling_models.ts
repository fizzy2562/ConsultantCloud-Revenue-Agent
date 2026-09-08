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

export interface ProductSellingModelRecord {
  id: string;
  name: string;
  sellingModelType: string | null;
  pricingTerm: number | null;
  pricingTermUnit: string | null;
  status: string | null;
}

export interface GetProductSellingModelsSuccess {
  ok: true;
  data: {
    sellingModels: ProductSellingModelRecord[];
    truncated: boolean;
  };
  meta: { requestId: string; durationMs: number; source: "salesforce" };
}

export interface GetProductSellingModelsFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  meta: { requestId: string; durationMs: number; source: "salesforce" };
}

export type getProductSellingModelsResult = GetProductSellingModelsSuccess | GetProductSellingModelsFailure;

export const getProductSellingModelsTool = {
  name: "get_product_selling_models",
  title: "Get Product Selling Models",
  description: "Lists ProductSellingModel records, optionally filtered by sellingModelType or status. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      sellingModelType: { type: "string", description: "Optional filter on SellingModelType (e.g. one-time, subscription, usage)." },
      status: { type: "string", description: "Optional filter on Status." },
    },
    required: [],
  },
};

export async function getProductSellingModelsHandler(
  conn: Connection,
  input: { sellingModelType?: string; status?: string }
): Promise<getProductSellingModelsResult> {
  try {
    const clauses: string[] = [];
    if (input.sellingModelType) {
      clauses.push(`SellingModelType = '${escapeSoql(input.sellingModelType)}'`);
    }
    if (input.status) {
      clauses.push(`Status = '${escapeSoql(input.status)}'`);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    // Per-product filtering requires confirming the join (likely a ProductSellingModelOption junction object) via a live describe call before it can be added.
    const soql = `SELECT Id, Name, SellingModelType, PricingTerm, PricingTermUnit, Status FROM ProductSellingModel${where} ORDER BY Name ASC LIMIT 26`;
    const records = await conn.query<any>(soql);
    const rows = records.records ?? [];
    const sellingModels: ProductSellingModelRecord[] = rows.slice(0, 25).map((r: any) => ({
      id: r.Id,
      name: r.Name ?? "Unknown",
      sellingModelType: r.SellingModelType ?? null,
      pricingTerm: r.PricingTerm ?? null,
      pricingTermUnit: r.PricingTermUnit ?? null,
      status: r.Status ?? null,
    }));
    return { ok: true, data: { sellingModels, truncated: rows.length > 25 }, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
