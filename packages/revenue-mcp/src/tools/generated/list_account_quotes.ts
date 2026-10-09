import type { Connection } from "jsforce";

function meta(source: "salesforce" = "salesforce") {
  return { requestId: crypto.randomUUID(), durationMs: 0, source };
}

function escapeSoql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export interface AccountQuoteLine {
  quoteLineId: string;
  productId: string | null;
  productName: string | null;
  quantity: number | null;
  unitPrice: number | null;
  discountPercent: number | null;
}

export interface AccountQuote {
  quoteId: string;
  quoteNumber: string | null;
  name: string | null;
  status: string | null;
  createdDate: string | null;
  lines: AccountQuoteLine[];
}

type Meta = { requestId: string; durationMs: number; source: "salesforce" };
export type listAccountQuotesResult =
  | { ok: true; data: AccountQuote[]; meta: Meta }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: Meta };

export const listAccountQuotesTool = {
  name: "list_account_quotes",
  title: "List Account Quotes",
  description:
    "Lists an account's open quotes (not accepted, denied, cancelled or already ordered), newest first, each with its quote lines: quoteLineId, product, quantity, unit price and discount. Use this to find the quote and quote line to change when the user names an account but not a quote, for example before apply_discount. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      accountId: { type: "string", description: "The Id of the Account, from find_account." },
    },
    required: ["accountId"],
  },
};

export async function listAccountQuotesHandler(conn: Connection, input: { accountId: string }): Promise<listAccountQuotesResult> {
  try {
    const soql = `SELECT Id, QuoteNumber, Name, Status, CreatedDate, (SELECT Id, Product2Id, Product2.Name, Quantity, UnitPrice, Discount FROM QuoteLineItems ORDER BY CreatedDate) FROM Quote WHERE AccountId = '${escapeSoql(input.accountId)}' AND Status NOT IN ('Accepted', 'Denied', 'Cancelled') AND Id NOT IN (SELECT QuoteId FROM Order WHERE QuoteId != null) ORDER BY CreatedDate DESC LIMIT 10`;
    const records = await conn.query<any>(soql);
    const data: AccountQuote[] = records.records.map((r: any) => ({
      quoteId: r.Id,
      quoteNumber: r.QuoteNumber ?? null,
      name: r.Name ?? null,
      status: r.Status ?? null,
      createdDate: r.CreatedDate ?? null,
      lines: (r.QuoteLineItems?.records ?? []).map((l: any) => ({
        quoteLineId: l.Id,
        productId: l.Product2Id ?? null,
        productName: l.Product2?.Name ?? null,
        quantity: l.Quantity ?? null,
        unitPrice: l.UnitPrice ?? null,
        discountPercent: l.Discount ?? null,
      })),
    }));
    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
