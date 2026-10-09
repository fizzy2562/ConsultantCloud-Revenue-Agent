import type { Connection } from "jsforce";
import { escapeSoql, failure, meta, records, round2, type Result } from "./insight_shared";

export type PriceStep = { step: string; amount: number | null; detail: string };
export type LinePriceExplanation = {
  quoteLineId: string;
  quoteNumber: string | null;
  product: string | null;
  quantity: number | null;
  sellingModel: string | null;
  term: string | null;
  waterfall: PriceStep[];
  netTotal: number | null;
  findings: string[];
};
export type PriceExplanation = { quoteNumber: string | null; lines: LinePriceExplanation[]; quoteTotal: number | null };

export const explainPriceTool = {
  name: "explain_price",
  title: "Explain Price",
  description:
    "Explains why a quote line, or every line on a quote, costs what it does: a waterfall from the price book list price, through the pricing term, unit price, line discount and each price adjustment (with its source), to the net total, plus findings such as a line that has a list price but was never priced. Give quoteLineId, or quoteId to explain the whole quote. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      quoteLineId: { type: "string", description: "One QuoteLineItem Id." },
      quoteId: { type: "string", description: "A Quote Id, to explain all its lines." },
    },
    required: [],
  },
};

export async function explainPriceHandler(conn: Connection, input: { quoteLineId?: string; quoteId?: string }): Promise<Result<PriceExplanation>> {
  try {
    if (!input.quoteLineId && !input.quoteId) return failure(new Error("Give quoteLineId or quoteId"), "INVALID_INPUT");
    const where = input.quoteLineId ? `Id = '${escapeSoql(input.quoteLineId)}'` : `QuoteId = '${escapeSoql(input.quoteId!)}'`;
    const lines = await records<any>(
      conn,
      `SELECT Id, Quote.QuoteNumber, Quote.TotalPrice, Product2.Name, Quantity, ListPrice, UnitPrice, Discount, DiscountAmount, NetUnitPrice, TotalPrice, NetTotalPrice, TotalAdjustmentAmount, PricingTermCount, StartDate, EndDate, ProductSellingModel.Name, ProductSellingModel.SellingModelType, PricebookEntry.UnitPrice, PricebookEntry.Pricebook2.Name FROM QuoteLineItem WHERE ${where} ORDER BY CreatedDate`
    );
    if (lines.length === 0) return failure(new Error("No quote line found"), "NOT_FOUND");
    const lineIds = lines.map((l) => `'${escapeSoql(l.Id)}'`).join(", ");
    const adjustments = await records<any>(
      conn,
      `SELECT QuoteLineItemId, AdjustmentSource, AdjustmentType, AdjustmentValue, TotalAmount, Description, Priority FROM QuoteLinePriceAdjustment WHERE QuoteLineItemId IN (${lineIds}) ORDER BY Priority NULLS LAST`
    ).catch(() => [] as any[]);

    const explained: LinePriceExplanation[] = lines.map((l) => {
      const waterfall: PriceStep[] = [];
      const findings: string[] = [];
      const list = l.PricebookEntry?.UnitPrice ?? l.ListPrice ?? null;
      waterfall.push({ step: "List price", amount: list, detail: `${l.PricebookEntry?.Pricebook2?.Name ?? "price book"} entry${l.ProductSellingModel?.Name ? ` for "${l.ProductSellingModel.Name}"` : ""}` });
      if (l.PricingTermCount != null && l.PricingTermCount !== 1) {
        waterfall.push({ step: "Pricing term", amount: list != null ? round2(list * l.PricingTermCount) : null, detail: `× ${round2(l.PricingTermCount)} terms (${l.StartDate ?? "?"} to ${l.EndDate ?? "?"})` });
      }
      waterfall.push({ step: "Unit price", amount: l.UnitPrice ?? null, detail: "the price Revenue Cloud's pricing set for one unit" });
      if (l.Discount) {
        const amount = l.DiscountAmount != null ? -Math.abs(l.DiscountAmount) : l.UnitPrice != null ? -round2((l.UnitPrice * l.Discount) / 100) : null;
        waterfall.push({ step: "Line discount", amount, detail: `${l.Discount}% off the unit price` });
        if (l.Discount >= 100) findings.push("A 100% discount makes this line free.");
      }
      for (const a of adjustments.filter((x) => x.QuoteLineItemId === l.Id)) {
        waterfall.push({ step: `Adjustment: ${a.AdjustmentSource ?? a.AdjustmentType ?? "price adjustment"}`, amount: a.TotalAmount ?? null, detail: [a.AdjustmentType, a.AdjustmentValue != null ? String(a.AdjustmentValue) : null, a.Description].filter(Boolean).join(" · ") });
      }
      waterfall.push({ step: "Net unit price", amount: l.NetUnitPrice ?? null, detail: "after discounts and adjustments" });
      waterfall.push({ step: "Net total", amount: l.NetTotalPrice ?? l.TotalPrice ?? null, detail: `× ${l.Quantity ?? "?"}` });

      if ((list ?? 0) > 0 && !(l.UnitPrice > 0)) {
        findings.push("This line has a list price but its unit price is 0: Revenue Cloud's pricing never priced it. Check that pricing data is synced (diagnose_product) and that the pricing procedure's list-price step matches this product and selling model.");
      }
      if (l.Discount && !(l.UnitPrice > 0)) findings.push(`A ${l.Discount}% discount is recorded, but it has no effect until the line is priced.`);
      if (l.UnitPrice > 0 && list != null && l.PricingTermCount && Math.abs(l.UnitPrice - list * l.PricingTermCount) > 0.01 && !l.Discount) {
        findings.push(`The unit price (${l.UnitPrice}) differs from list × term (${round2(list * l.PricingTermCount)}): a pricing rule, contract price or proration changed it.`);
      }
      return {
        quoteLineId: l.Id,
        quoteNumber: l.Quote?.QuoteNumber ?? null,
        product: l.Product2?.Name ?? null,
        quantity: l.Quantity ?? null,
        sellingModel: l.ProductSellingModel?.Name ?? null,
        term: l.StartDate ? `${l.StartDate} to ${l.EndDate ?? "open"}` : null,
        waterfall,
        netTotal: l.NetTotalPrice ?? l.TotalPrice ?? null,
        findings,
      };
    });
    return { ok: true, data: { quoteNumber: lines[0].Quote?.QuoteNumber ?? null, lines: explained, quoteTotal: lines[0].Quote?.TotalPrice ?? null }, meta: meta() };
  } catch (err) {
    return failure(err);
  }
}
