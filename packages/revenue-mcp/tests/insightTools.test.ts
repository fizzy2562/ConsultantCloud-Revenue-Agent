import { describe, expect, it, vi } from "vitest";
import type { Connection } from "jsforce";
import { diagnoseProductHandler } from "../src/tools/generated/diagnose_product.js";
import { explainPriceHandler } from "../src/tools/generated/explain_price.js";
import { customerRevenue360Handler } from "../src/tools/generated/customer_revenue_360.js";
import { explainAssetHistoryHandler } from "../src/tools/generated/explain_asset_history.js";

/** A fake org that answers each SOQL query by the first matching pattern. */
function org(routes: Array<[RegExp, unknown[] | Error]>): Connection {
  return {
    query: vi.fn(async (soql: string) => {
      const route = routes.find(([pattern]) => pattern.test(soql));
      if (route?.[1] instanceof Error) throw route[1];
      return { records: route?.[1] ?? [] };
    }),
  } as unknown as Connection;
}

const cloudPro = { Id: "01tP", Name: "Cloud Pro", ProductCode: "CP", IsActive: true, IsArchived: false, BasedOn: null };
const yearly = { ProductSellingModelId: "0jPY", ProductSellingModel: { Name: "Term Based - Yearly", SellingModelType: "TermDefined", Status: "Active" }, IsDefault: true };

describe("diagnose_product", () => {
  it("passes setup checks and blames pricing when lines price at 0", async () => {
    const result = await diagnoseProductHandler(
      org([
        [/FROM Product2/, [cloudPro]],
        [/FROM ProductSellingModelOption/, [yearly]],
        [/FROM PricebookEntry/, [{ Pricebook2: { Name: "Standard", IsStandard: true }, ProductSellingModelId: "0jPY", ProductSellingModel: { Name: "Term Based - Yearly" }, UnitPrice: 2400, IsActive: true, LastModifiedDate: "2026-10-09T10:00:00Z" }]],
        [/FROM ProductCategoryProduct/, [{ ProductCategory: { Name: "Software" }, Catalog: { Name: "Catalog" } }]],
        [/FROM DecisionTable/, [{ DeveloperName: "PBE", LastSyncDate: "2026-10-09T12:00:00Z", IsIncrementalSyncEnabled: false }]],
        [/FROM QuoteLineItem/, [{ Quote: { QuoteNumber: "142" }, ListPrice: 2400, UnitPrice: 0 }]],
      ]),
      { productName: "Cloud Pro" }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const status = Object.fromEntries(result.data.checks.map((c) => [c.area, c.status]));
    expect(status).toMatchObject({ Active: "pass", "Selling models": "pass", "Price entries": "pass", Catalog: "pass", "Pricing data sync": "pass", "Quote lines": "fail" });
    expect(result.data.likelyCause).toMatch(/pricing procedure returns 0/);
  });

  it("finds the missing selling-model price and stale pricing sync", async () => {
    const result = await diagnoseProductHandler(
      org([
        [/FROM Product2/, [cloudPro]],
        [/FROM ProductSellingModelOption/, [yearly]],
        [/FROM PricebookEntry/, [{ Pricebook2: { Name: "Standard", IsStandard: true }, ProductSellingModelId: null, UnitPrice: 2400, IsActive: true, LastModifiedDate: "2026-10-09T10:00:00Z" }]],
        [/FROM DecisionTable/, [{ DeveloperName: "PBE", LastSyncDate: "2026-09-24T09:30:00Z", IsIncrementalSyncEnabled: false }]],
      ]),
      { productId: "01tP" }
    );
    if (!result.ok) throw new Error("expected ok");
    const byArea = Object.fromEntries(result.data.checks.map((c) => [c.area, c]));
    expect(byArea["Price entries"]!.status).toBe("fail");
    expect(byArea["Price entries"]!.detail).toMatch(/PricebookEntryId/);
    expect(byArea["Pricing data sync"]!.status).toBe("fail");
    expect(byArea.Catalog!.status).toBe("fail");
    expect(result.data.likelyCause).toMatch(/^Price entries/);
  });

  it("says so when the product doesn't exist", async () => {
    const result = await diagnoseProductHandler(org([]), { productName: "Nope" });
    expect(result.ok && result.data.product).toBeNull();
  });
});

describe("explain_price", () => {
  it("builds the waterfall and flags an unpriced line with a discount", async () => {
    const result = await explainPriceHandler(
      org([
        [/FROM QuoteLineItem/, [{ Id: "0QL1", Quote: { QuoteNumber: "142" }, Product2: { Name: "Cloud Pro" }, Quantity: 100, ListPrice: 2400, UnitPrice: 0, Discount: 20, NetUnitPrice: 0, NetTotalPrice: 0, PricingTermCount: 1, PricebookEntry: { UnitPrice: 2400, Pricebook2: { Name: "Standard" } }, ProductSellingModel: { Name: "Term Based - Yearly" } }]],
        [/FROM QuoteLinePriceAdjustment/, []],
      ]),
      { quoteId: "0Q01" }
    );
    if (!result.ok) throw new Error("expected ok");
    const line = result.data.lines[0]!;
    expect(line.waterfall.map((s) => s.step)).toEqual(["List price", "Unit price", "Line discount", "Net unit price", "Net total"]);
    expect(line.findings.join(" ")).toMatch(/never priced.*no effect until the line is priced/s);
  });
});

describe("get_customer_revenue_360", () => {
  it("summarises assets, ARR and expiring subscriptions, and marks missing features unavailable", async () => {
    const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const result = await customerRevenue360Handler(
      org([
        [/FROM Account/, [{ Id: "001A", Name: "Acme", Industry: "Education" }]],
        [/FROM Asset WHERE/, [{ Id: "02i1", Product2: { Name: "Cloud Pro" }, Quantity: 100, LifecycleStartDate: "2025-01-01T00:00:00Z", LifecycleEndDate: `${soon}T23:59:59Z` }]],
        [/FROM AssetStatePeriod/, [{ AssetId: "02i1", Quantity: 100, Mrr: 1000, StartDate: "2025-01-01T00:00:00Z", EndDate: `${soon}T23:59:59Z` }]],
        [/FROM Quote/, []],
        [/FROM Order/, []],
        [/FROM Contract/, []],
        [/FROM Invoice/, new Error("sObject type 'Invoice' is not supported")],
      ]),
      { accountId: "001A" }
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.arr).toBe(12000);
    expect(result.data.summary.join(" ")).toMatch(/1 expire within 90 days/);
    expect(result.data.invoices).toEqual({ available: false, note: "not available in this org" });
  });
});

describe("explain_asset_history", () => {
  it("tells the story from the initial sale", async () => {
    const result = await explainAssetHistoryHandler(
      org([
        [/FROM Asset WHERE/, [{ Id: "02i1", Name: "Cloud Pro", Product2: { Name: "Cloud Pro" }, Account: { Name: "Acme" }, LifecycleStartDate: "2025-01-01T00:00:00Z" }]],
        [/FROM AssetAction WHERE/, [{ Id: "AA1", ActionDate: "2025-01-01T00:00:00Z", CategoryEnum: "Initial Sale", QuantityChange: 20 }, { Id: "AA2", ActionDate: "2025-06-01T00:00:00Z", CategoryEnum: "Upsells", QuantityChange: 55 }]],
        [/FROM AssetActionSource/, [{ AssetActionId: "AA1", Quantity: 20, ListPrice: 100, NetUnitPrice: 90, Discount: 10 }]],
        [/FROM AssetStatePeriod/, [{ StartDate: "2025-06-01T00:00:00Z", EndDate: "2026-01-01T00:00:00Z", Quantity: 75, Mrr: 6750 }]],
      ]),
      { assetId: "02i1" }
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.data.story).toEqual([
      "2025-01-01: Initial Sale, +20 units at a net unit price of 90 (list 100, 10% off).",
      "2025-06-01: Upsells, +55 units.",
      "Now: 75 units, MRR 6750, until 2026-01-01.",
    ]);
  });
});
