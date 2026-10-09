import type { Connection } from "jsforce";
import { escapeSoql, failure, meta, records, type Result } from "./insight_shared";

export type AssetEvent = {
  date: string | null;
  action: string;
  quantityChange: number | null;
  amountChange: number | null;
  mrrChange: number | null;
  source: Array<{ quantity: number | null; listPrice: number | null; netUnitPrice: number | null; discount: number | null; startDate: string | null; endDate: string | null; reference: string | null }>;
};
export type AssetPeriod = { startDate: string | null; endDate: string | null; quantity: number | null; amount: number | null; mrr: number | null; unitPrice: number | null; discount: number | null };
export type AssetHistory = {
  asset: { id: string; name: string | null; product: string | null; account: string | null; startDate: string | null; endDate: string | null };
  events: AssetEvent[];
  periods: AssetPeriod[];
  story: string[];
};

export const explainAssetHistoryTool = {
  name: "explain_asset_history",
  title: "Explain Asset History",
  description:
    "Tells the story of a subscription asset since purchase: every asset action in date order (original sale, amendment, renewal, cancellation) with its quantity, amount and MRR change and the source transaction lines (quantity, list and net price, discount, dates), plus its state periods over time. Use for 'how did this go from 20 seats to 75?', 'what price did they originally negotiate?' or 'why can't I renew this?'. Give assetId (from get_account_assets). Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: { assetId: { type: "string", description: "The Asset Id, from get_account_assets." } },
    required: ["assetId"],
  },
};

export async function explainAssetHistoryHandler(conn: Connection, input: { assetId: string }): Promise<Result<AssetHistory>> {
  try {
    const id = escapeSoql(input.assetId);
    const [asset] = await records<any>(conn, `SELECT Id, Name, Product2.Name, Account.Name, LifecycleStartDate, LifecycleEndDate FROM Asset WHERE Id = '${id}'`);
    if (!asset) return failure(new Error("No asset found"), "NOT_FOUND");
    const actions = await records<any>(conn, `SELECT Id, ActionDate, Type, CategoryEnum, QuantityChange, Amount, MrrChange FROM AssetAction WHERE AssetId = '${id}' ORDER BY ActionDate, CreatedDate`);
    const sources = actions.length
      ? await records<any>(
          conn,
          `SELECT AssetActionId, Quantity, ListPrice, NetUnitPrice, Discount, StartDate, EndDate, ReferenceEntityItemId FROM AssetActionSource WHERE AssetActionId IN (${actions.map((a) => `'${escapeSoql(a.Id)}'`).join(", ")})`
        )
      : [];
    // UnitPrice and Discount exist on AssetStatePeriod but aren't readable by every user; the
    // prices come from the action sources instead.
    const periods = await records<any>(conn, `SELECT StartDate, EndDate, Quantity, Amount, Mrr FROM AssetStatePeriod WHERE AssetId = '${id}' ORDER BY StartDate`);

    const events: AssetEvent[] = actions.map((a) => ({
      date: a.ActionDate?.slice(0, 10) ?? null,
      action: [a.CategoryEnum, a.Type].filter(Boolean).join(" · ") || "Action",
      quantityChange: a.QuantityChange ?? null,
      amountChange: a.Amount ?? null,
      mrrChange: a.MrrChange ?? null,
      source: sources
        .filter((s) => s.AssetActionId === a.Id)
        .map((s) => ({
          quantity: s.Quantity ?? null,
          listPrice: s.ListPrice ?? null,
          netUnitPrice: s.NetUnitPrice ?? null,
          discount: s.Discount ?? null,
          startDate: s.StartDate?.slice(0, 10) ?? null,
          endDate: s.EndDate?.slice(0, 10) ?? null,
          reference: s.ReferenceEntityItemId ?? null,
        })),
    }));
    const timeline: AssetPeriod[] = periods.map((p) => ({
      startDate: p.StartDate?.slice(0, 10) ?? null,
      endDate: p.EndDate?.slice(0, 10) ?? null,
      quantity: p.Quantity ?? null,
      amount: p.Amount ?? null,
      mrr: p.Mrr ?? null,
      unitPrice: null,
      discount: null,
    }));

    const story: string[] = [];
    const first = events[0];
    if (first) {
      const src = first.source[0];
      story.push(
        `${first.date}: ${first.action}${first.quantityChange != null ? `, ${first.quantityChange > 0 ? "+" : ""}${first.quantityChange} units` : ""}${src?.netUnitPrice != null ? ` at a net unit price of ${src.netUnitPrice}${src.listPrice != null ? ` (list ${src.listPrice}${src.discount ? `, ${src.discount}% off` : ""})` : ""}` : ""}.`
      );
    }
    for (const e of events.slice(1)) {
      story.push(`${e.date}: ${e.action}${e.quantityChange ? `, ${e.quantityChange > 0 ? "+" : ""}${e.quantityChange} units` : ""}${e.amountChange ? `, amount ${e.amountChange > 0 ? "+" : ""}${e.amountChange}` : ""}.`);
    }
    const last = timeline[timeline.length - 1];
    if (last) story.push(`Now: ${last.quantity ?? "?"} units${last.mrr != null ? `, MRR ${last.mrr}` : ""}, until ${last.endDate ?? "open-ended"}.`);
    if (events.length === 0) story.push("No asset actions recorded: this asset wasn't created through Revenue Cloud's order-to-asset process, so it can't be amended or renewed.");

    return {
      ok: true,
      data: {
        asset: {
          id: asset.Id,
          name: asset.Name ?? null,
          product: asset.Product2?.Name ?? null,
          account: asset.Account?.Name ?? null,
          startDate: asset.LifecycleStartDate?.slice(0, 10) ?? null,
          endDate: asset.LifecycleEndDate?.slice(0, 10) ?? null,
        },
        events,
        periods: timeline,
        story,
      },
      meta: meta(),
    };
  } catch (err) {
    return failure(err);
  }
}
