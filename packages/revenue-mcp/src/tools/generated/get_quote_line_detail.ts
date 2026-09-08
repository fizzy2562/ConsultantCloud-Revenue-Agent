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

export interface QuoteLineDetail {
  quoteLineId: string;
  quoteId: string;
  productId: string | null;
  productName: string | null;
  quantity: number | null;
  discountPercent: number | null;
  netPrice: number | null;
}

export interface GetQuoteLineDetailMeta {
  requestId: string;
  durationMs: number;
  source: "salesforce";
}

export interface GetQuoteLineDetailSuccess {
  ok: true;
  data: QuoteLineDetail[];
  meta: GetQuoteLineDetailMeta;
}

export interface GetQuoteLineDetailFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  meta: GetQuoteLineDetailMeta;
}

export type getQuoteLineDetailResult = GetQuoteLineDetailSuccess | GetQuoteLineDetailFailure;

export const getQuoteLineDetailTool = {
  name: "get_quote_line_detail",
  title: "Get Quote Line Detail",
  description: "Returns per-line detail (id, product, quantity, discount, net price) for every QuoteLineItem on a given quote. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      quoteId: { type: "string", description: "The Quote Id (18-char Salesforce Id) whose line items should be returned." },
    },
    required: ["quoteId"],
  },
};

export async function getQuoteLineDetailHandler(conn: Connection, input: { quoteId: string }): Promise<getQuoteLineDetailResult> {
  try {
    const records = await conn.query<any>(`SELECT Id, QuoteId, Product2Id, Product2.Name, Quantity, Discount, TotalPrice FROM QuoteLineItem WHERE QuoteId = '${escapeSoql(input.quoteId)}'`);
    const data: QuoteLineDetail[] = records.records.map((r: any) => ({
      quoteLineId: r.Id,
      quoteId: r.QuoteId,
      productId: r.Product2Id ?? null,
      productName: r.Product2?.Name ?? null,
      quantity: r.Quantity ?? null,
      discountPercent: r.Discount ?? null,
      netPrice: r.TotalPrice ?? null,
    }));
    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
