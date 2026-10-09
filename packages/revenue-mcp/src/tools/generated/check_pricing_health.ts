import type { Connection } from "jsforce";
import { addDays, failure, meta, optionalSection, records, today, type Result } from "./insight_shared";

export type PricingIssue = { product: string; productId: string; issue: string; fix: string };
export type PricingHealth = {
  summary: string[];
  issues: PricingIssue[];
  staleDecisionTables: Array<{ name: string; lastSync: string | null; changedSince: number }>;
  zeroPricedLines: Array<{ product: string; lines: number; latestQuote: string | null }>;
  checkedProducts: number;
};

export const checkPricingHealthTool = {
  name: "check_pricing_health",
  title: "Check Pricing Health",
  description:
    "Org-wide check of whether Revenue Cloud can price the catalog. Finds active, sellable products that will price at 0 or can't be quoted: Configure During Sale not set, no standard price for a selling model, or an active price entry without a selling model beside selling-model ones; price book decision tables that haven't synced since prices changed; and products whose recent quote lines (last 90 days) have a list price but a unit price of 0. Returns each issue with its fix. Use for 'which products won't price?' or before a demo. Read-only.",
  kind: "read" as const,
  inputSchema: { type: "object", properties: {}, required: [] },
};

export async function checkPricingHealthHandler(conn: Connection): Promise<Result<PricingHealth>> {
  try {
    const options = await records<any>(
      conn,
      "SELECT Product2Id, Product2.Name, Product2.ConfigureDuringSale, ProductSellingModelId, ProductSellingModel.Name FROM ProductSellingModelOption WHERE Product2.IsActive = true AND ProductSellingModel.Status = 'Active' LIMIT 2000"
    );
    const [standard] = await records<any>(conn, "SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1");
    const entries = standard
      ? await records<any>(conn, `SELECT Product2Id, ProductSellingModelId, IsActive, LastModifiedDate FROM PricebookEntry WHERE Pricebook2Id = '${standard.Id}' AND Product2.IsActive = true LIMIT 5000`)
      : [];

    const issues: PricingIssue[] = [];
    const products = new Map<string, { name: string; cds: string | null; models: Array<{ id: string; name: string }> }>();
    for (const o of options) {
      const p = products.get(o.Product2Id) ?? { name: o.Product2?.Name ?? o.Product2Id, cds: o.Product2?.ConfigureDuringSale ?? null, models: [] as Array<{ id: string; name: string }> };
      p.models.push({ id: o.ProductSellingModelId, name: o.ProductSellingModel?.Name ?? o.ProductSellingModelId });
      products.set(o.Product2Id, p);
    }
    for (const [id, p] of products) {
      const mine = entries.filter((e) => e.Product2Id === id && e.IsActive);
      if (!p.cds) issues.push({ product: p.name, productId: id, issue: "Configure During Sale isn't set: its quote lines price at 0.", fix: "Set Configure During Sale (Allowed or NotAllowed) on the product." });
      for (const m of p.models) {
        if (!mine.some((e) => e.ProductSellingModelId === m.id)) {
          issues.push({ product: p.name, productId: id, issue: `No active standard price for selling model "${m.name}": it can't be added to a quote with that model.`, fix: `Add a standard price book entry for "${m.name}".` });
        }
      }
      if (mine.some((e) => !e.ProductSellingModelId) && mine.some((e) => e.ProductSellingModelId)) {
        issues.push({ product: p.name, productId: id, issue: "Has an active standard price without a selling model, beside selling-model prices.", fix: "Deactivate the price entry that has no selling model." });
      }
    }

    const staleDecisionTables: PricingHealth["staleDecisionTables"] = [];
    const tables = await optionalSection(async () =>
      records<any>(conn, "SELECT DeveloperName, LastSyncDate, IsIncrementalSyncEnabled FROM DecisionTable WHERE SourceObject = 'PricebookEntry' AND Status = 'Active'")
    );
    if (tables.available) {
      for (const t of tables.data) {
        if (t.IsIncrementalSyncEnabled) continue;
        const changedSince = entries.filter((e) => !t.LastSyncDate || e.LastModifiedDate > t.LastSyncDate).length;
        if (changedSince) staleDecisionTables.push({ name: t.DeveloperName, lastSync: t.LastSyncDate ?? null, changedSince });
      }
    }

    const since = addDays(today(), -90);
    const zero = await records<any>(
      conn,
      `SELECT Product2.Name, Quote.QuoteNumber, CreatedDate FROM QuoteLineItem WHERE ListPrice > 0 AND (UnitPrice = 0 OR UnitPrice = null) AND CreatedDate >= ${since}T00:00:00Z ORDER BY CreatedDate DESC LIMIT 500`
    );
    const byProduct = new Map<string, { lines: number; latestQuote: string | null }>();
    for (const l of zero) {
      const name = l.Product2?.Name ?? "unknown";
      const entry = byProduct.get(name) ?? { lines: 0, latestQuote: l.Quote?.QuoteNumber ?? null };
      entry.lines += 1;
      byProduct.set(name, entry);
    }
    const zeroPricedLines = [...byProduct].map(([product, v]) => ({ product, ...v })).sort((a, b) => b.lines - a.lines);

    const affected = new Set(issues.map((i) => i.productId));
    const summary = [
      `Checked ${products.size} active products with selling models.`,
      issues.length ? `${affected.size} product${affected.size === 1 ? " has" : "s have"} pricing setup issues (${issues.length} in all).` : "No product setup issues found.",
      staleDecisionTables.length
        ? `${staleDecisionTables.map((t) => t.name).join(", ")} ${staleDecisionTables.length === 1 ? "hasn't" : "haven't"} synced since prices changed: run Sync Pricing Data.`
        : "Price book decision tables are up to date.",
      zeroPricedLines.length ? `${zeroPricedLines.reduce((s, z) => s + z.lines, 0)} quote lines in the last 90 days have a list price but a unit price of 0.` : "No zero-priced quote lines in the last 90 days.",
    ];
    return { ok: true, data: { summary, issues: issues.slice(0, 50), staleDecisionTables, zeroPricedLines: zeroPricedLines.slice(0, 25), checkedProducts: products.size }, meta: meta() };
  } catch (err) {
    return failure(err);
  }
}
