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

export interface ExplainQuoteLinePriceData {
  quoteLineId: string;
  productName: string | null;
  quantity: number | null;
  discountPercent: number | null;
  netPrice: number | null;
  steps: [];
  note: string;
}

export interface ExplainQuoteLinePriceMeta {
  requestId: string;
  durationMs: number;
  source: "salesforce";
}

export type ExplainQuoteLinePriceResult =
  | { ok: true; data: ExplainQuoteLinePriceData; meta: ExplainQuoteLinePriceMeta }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: ExplainQuoteLinePriceMeta };

export const explainQuoteLinePriceTool = {
  name: "explain_quote_line_price",
  title: "Explain Quote Line Price",
  description:
    "Returns current price/discount detail for a single quote line by quoteLineId, plus a placeholder pricing-waterfall steps array (empty today) with a note explaining that full waterfall traceability requires a CalculationProcedureStep join once the linking field is confirmed. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      quoteLineId: { type: "string", description: "The Id of the QuoteLineItem record to look up." },
    },
    required: ["quoteLineId"],
  },
};

export async function explainQuoteLinePriceHandler(
  conn: Connection,
  input: { quoteLineId: string }
): Promise<ExplainQuoteLinePriceResult> {
  try {
    const records = await conn.query<any>(
      `SELECT Id, Product2.Name, Quantity, Discount, TotalPrice FROM QuoteLineItem WHERE Id = '${escapeSoql(input.quoteLineId)}'`
    );
    const record = records.records[0];
    if (!record) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Quote line not found", retryable: false }, meta: meta() };
    }
    return {
      ok: true,
      data: {
        quoteLineId: input.quoteLineId,
        productName: record.Product2?.Name ?? null,
        quantity: record.Quantity ?? null,
        discountPercent: record.Discount ?? null,
        netPrice: record.TotalPrice ?? null,
        steps: [],
        note: "Full pricing-waterfall traceability requires a CalculationProcedureStep join; the linking field to QuoteLineItem has not been confirmed via a live describe call yet.",
      },
      meta: meta(),
    };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
