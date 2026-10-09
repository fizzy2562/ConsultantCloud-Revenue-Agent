import type { Connection } from "jsforce";
import { addDays, escapeSoql, failure, meta, optionalSection, records, round2, today, type Result } from "./insight_shared";

type Section<T> = { available: true; data: T } | { available: false; note: string };
export type Revenue360 = {
  account: { id: string; name: string; industry: string | null };
  summary: string[];
  assets: Section<Array<{ assetId: string; product: string | null; quantity: number | null; mrr: number | null; startDate: string | null; endDate: string | null; expiresWithin90Days: boolean }>>;
  arr: number | null;
  openQuotes: Section<Array<{ quoteId: string; quoteNumber: string | null; name: string | null; status: string | null; total: number | null; lines: number }>>;
  orders: Section<Array<{ orderId: string; orderNumber: string | null; status: string | null; total: number | null; effectiveDate: string | null }>>;
  contracts: Section<Array<{ contractId: string; contractNumber: string | null; status: string | null; startDate: string | null; endDate: string | null }>>;
  invoices: Section<{ open: number; outstandingBalance: number; overdue: number; nextBillingDate: string | null }>;
};

export const customerRevenue360Tool = {
  name: "get_customer_revenue_360",
  title: "Customer Revenue 360",
  description:
    "The commercial position of an account in one call: what it owns now (assets with quantity, MRR and term, flagging those that expire within 90 days), ARR, open quotes, orders, contracts, and invoices (open count, outstanding and overdue balance, next billing date). Sections an org doesn't use are marked unavailable rather than failing. Use for 'what should I know about this customer', renewals due, or unpaid invoices. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: { accountId: { type: "string", description: "The Account Id, from find_account." } },
    required: ["accountId"],
  },
};

export async function customerRevenue360Handler(conn: Connection, input: { accountId: string }): Promise<Result<Revenue360>> {
  try {
    const id = escapeSoql(input.accountId);
    const [account] = await records<any>(conn, `SELECT Id, Name, Industry FROM Account WHERE Id = '${id}'`);
    if (!account) return failure(new Error("No account found"), "NOT_FOUND");
    const now = today();
    const horizon = addDays(now, 90);

    const assets = await optionalSection(async () => {
      const list = await records<any>(conn, `SELECT Id, Product2.Name, Quantity, LifecycleStartDate, LifecycleEndDate FROM Asset WHERE AccountId = '${id}' AND LifecycleStartDate != null`);
      if (list.length === 0) return [];
      const periods = await records<any>(
        conn,
        `SELECT AssetId, Quantity, Mrr, StartDate, EndDate FROM AssetStatePeriod WHERE AssetId IN (${list.map((a) => `'${escapeSoql(a.Id)}'`).join(", ")}) AND StartDate <= ${now}T23:59:59Z ORDER BY StartDate DESC`
      ).catch(() => [] as any[]);
      return list.map((a) => {
        const current = periods.find((p) => p.AssetId === a.Id && (!p.EndDate || p.EndDate.slice(0, 10) >= now));
        const end = (current?.EndDate ?? a.LifecycleEndDate ?? null)?.slice(0, 10) ?? null;
        return {
          assetId: a.Id,
          product: a.Product2?.Name ?? null,
          quantity: current?.Quantity ?? a.Quantity ?? null,
          mrr: current?.Mrr ?? null,
          startDate: (a.LifecycleStartDate ?? null)?.slice(0, 10) ?? null,
          endDate: end,
          expiresWithin90Days: !!end && end >= now && end <= horizon,
        };
      });
    });
    const arr = assets.available ? round2(assets.data.reduce((sum, a) => sum + (a.mrr ?? 0), 0) * 12) : null;

    const openQuotes = await optionalSection(async () =>
      (
        await records<any>(
          conn,
          `SELECT Id, QuoteNumber, Name, Status, TotalPrice, (SELECT Id FROM QuoteLineItems) FROM Quote WHERE AccountId = '${id}' AND Status NOT IN ('Accepted', 'Denied', 'Cancelled') AND Id NOT IN (SELECT QuoteId FROM Order WHERE QuoteId != null) ORDER BY CreatedDate DESC LIMIT 20`
        )
      ).map((q) => ({ quoteId: q.Id, quoteNumber: q.QuoteNumber ?? null, name: q.Name ?? null, status: q.Status ?? null, total: q.TotalPrice ?? null, lines: q.QuoteLineItems?.totalSize ?? 0 }))
    );
    const orders = await optionalSection(async () =>
      (await records<any>(conn, `SELECT Id, OrderNumber, Status, TotalAmount, EffectiveDate FROM Order WHERE AccountId = '${id}' ORDER BY CreatedDate DESC LIMIT 20`)).map((o) => ({
        orderId: o.Id,
        orderNumber: o.OrderNumber ?? null,
        status: o.Status ?? null,
        total: o.TotalAmount ?? null,
        effectiveDate: o.EffectiveDate ?? null,
      }))
    );
    const contracts = await optionalSection(async () =>
      (await records<any>(conn, `SELECT Id, ContractNumber, Status, StartDate, EndDate FROM Contract WHERE AccountId = '${id}' ORDER BY StartDate DESC LIMIT 20`)).map((c) => ({
        contractId: c.Id,
        contractNumber: c.ContractNumber ?? null,
        status: c.Status ?? null,
        startDate: c.StartDate ?? null,
        endDate: c.EndDate ?? null,
      }))
    );
    const invoices = await optionalSection(async () => {
      const open = await records<any>(
        conn,
        `SELECT Balance, DueDate FROM Invoice WHERE BillingAccountId = '${id}' AND Status = 'Posted' AND Balance > 0 LIMIT 200`
      );
      const [next] = await records<any>(conn, `SELECT NextBillingDate FROM BillingSchedule WHERE BillingAccountId = '${id}' AND NextBillingDate >= ${now} ORDER BY NextBillingDate LIMIT 1`).catch(() => []);
      return {
        open: open.length,
        outstandingBalance: round2(open.reduce((s, i) => s + (i.Balance ?? 0), 0)),
        overdue: round2(open.filter((i) => i.DueDate && i.DueDate < now).reduce((s, i) => s + (i.Balance ?? 0), 0)),
        nextBillingDate: next?.NextBillingDate ?? null,
      };
    });

    const summary: string[] = [];
    if (assets.available) {
      const expiring = assets.data.filter((a) => a.expiresWithin90Days);
      summary.push(`${assets.data.length} active asset${assets.data.length === 1 ? "" : "s"}${arr ? `, ARR ${arr}` : ""}.`);
      if (expiring.length) summary.push(`${expiring.length} expire within 90 days (${expiring.map((a) => `${a.product} on ${a.endDate}`).join(", ")}).`);
    }
    if (openQuotes.available && openQuotes.data.length) summary.push(`${openQuotes.data.length} open quote${openQuotes.data.length === 1 ? "" : "s"} (${openQuotes.data.map((q) => q.quoteNumber).join(", ")}).`);
    if (orders.available) {
      const draft = orders.data.filter((o) => o.status !== "Activated");
      if (draft.length) summary.push(`${draft.length} order${draft.length === 1 ? "" : "s"} not yet activated.`);
    }
    if (invoices.available && invoices.data.outstandingBalance > 0) summary.push(`${invoices.data.outstandingBalance} outstanding on ${invoices.data.open} invoice${invoices.data.open === 1 ? "" : "s"}${invoices.data.overdue > 0 ? `, ${invoices.data.overdue} overdue` : ""}.`);

    return {
      ok: true,
      data: { account: { id: account.Id, name: account.Name, industry: account.Industry ?? null }, summary, assets, arr, openQuotes, orders, contracts, invoices },
      meta: meta(),
    };
  } catch (err) {
    return failure(err);
  }
}
