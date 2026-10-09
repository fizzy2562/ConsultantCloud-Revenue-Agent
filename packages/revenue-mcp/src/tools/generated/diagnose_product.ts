import type { Connection } from "jsforce";
import { escapeSoql, failure, meta, optionalSection, records, today, type Result } from "./insight_shared";

export type CheckStatus = "pass" | "warn" | "fail" | "not checked";
export type ProductCheck = { area: string; status: CheckStatus; detail: string };
export type ProductDiagnosis = {
  product: { id: string; name: string; productCode: string | null } | null;
  checks: ProductCheck[];
  likelyCause: string;
};

export const diagnoseProductTool = {
  name: "diagnose_product",
  title: "Diagnose Product",
  description:
    "Explains why a product can't be found, quoted or priced. Checks, in order: the product exists and is active and in date; its product classification; its selling models; its price book entries for each selling model; its catalog and category; whether Revenue Cloud's pricing data has been synced since its prices changed; and how its recent quote lines priced. Returns each check as pass/warn/fail with the evidence, and the most likely cause. Give productId (from search_products) or productName. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      productId: { type: "string", description: "The Product2 Id, from search_products." },
      productName: { type: "string", description: "The exact product name, if you don't have the Id." },
    },
    required: [],
  },
};

export async function diagnoseProductHandler(conn: Connection, input: { productId?: string; productName?: string }): Promise<Result<ProductDiagnosis>> {
  try {
    if (!input.productId && !input.productName) return failure(new Error("Give productId or productName"), "INVALID_INPUT");
    const where = input.productId ? `Id = '${escapeSoql(input.productId)}'` : `Name = '${escapeSoql(input.productName!)}'`;
    const [product] = await records<any>(
      conn,
      `SELECT Id, Name, ProductCode, IsActive, IsArchived, AvailabilityDate, DiscontinuedDate, EndOfLifeDate, BasedOn.Name, ConfigureDuringSale FROM Product2 WHERE ${where} LIMIT 1`
    );
    const checks: ProductCheck[] = [];
    const add = (area: string, status: CheckStatus, detail: string) => checks.push({ area, status, detail });
    if (!product) {
      add("Product", "fail", `No product matches ${input.productId ?? `"${input.productName}"`}.`);
      return { ok: true, data: { product: null, checks, likelyCause: "The product doesn't exist (or isn't visible to this user)." }, meta: meta() };
    }
    const id = escapeSoql(product.Id);

    // 1. Active and in date.
    const now = today();
    const outOfDate =
      (product.AvailabilityDate && product.AvailabilityDate > now && `not available until ${product.AvailabilityDate}`) ||
      (product.DiscontinuedDate && product.DiscontinuedDate <= now && `discontinued on ${product.DiscontinuedDate}`) ||
      (product.EndOfLifeDate && product.EndOfLifeDate <= now && `end of life on ${product.EndOfLifeDate}`);
    if (!product.IsActive || product.IsArchived) add("Active", "fail", product.IsArchived ? "The product is archived." : "The product is inactive.");
    else if (outOfDate) add("Active", "fail", `Active, but ${outOfDate}.`);
    else add("Active", "pass", "Active and in date.");

    // 2. Classification (attributes and configuration come from it).
    add("Classification", product.BasedOn?.Name ? "pass" : "warn", product.BasedOn?.Name ? `Based on product classification "${product.BasedOn.Name}".` : "No product classification: it has no inherited attributes. Fine for simple products.");

    // 3. Selling models.
    const models = await records<any>(conn, `SELECT ProductSellingModelId, ProductSellingModel.Name, ProductSellingModel.SellingModelType, ProductSellingModel.Status, IsDefault FROM ProductSellingModelOption WHERE Product2Id = '${id}'`);
    if (models.length === 0) add("Selling models", "fail", "No selling model: it can't be added to a quote.");
    else {
      const inactive = models.filter((m) => m.ProductSellingModel?.Status !== "Active");
      add("Selling models", inactive.length === models.length ? "fail" : inactive.length ? "warn" : "pass", models.map((m) => `${m.ProductSellingModel?.Name} (${m.ProductSellingModel?.SellingModelType}${m.IsDefault ? ", default" : ""}${m.ProductSellingModel?.Status !== "Active" ? ", INACTIVE" : ""})`).join("; "));
    }

    // 4. Price entries per selling model, in the standard price book.
    const entries = await records<any>(conn, `SELECT Id, Pricebook2.Name, Pricebook2.IsStandard, ProductSellingModelId, ProductSellingModel.Name, UnitPrice, IsActive, LastModifiedDate FROM PricebookEntry WHERE Product2Id = '${id}'`);
    const standardEntries = entries.filter((e) => e.Pricebook2?.IsStandard && e.IsActive);
    const missingModels = models.filter((m) => !standardEntries.some((e) => e.ProductSellingModelId === m.ProductSellingModelId));
    if (standardEntries.length === 0) add("Price entries", "fail", "No active entry in the standard price book.");
    else if (missingModels.length) add("Price entries", "fail", `No standard price for selling model ${missingModels.map((m) => `"${m.ProductSellingModel?.Name}"`).join(", ")}: adding it to a quote fails with "Required fields are missing: [PricebookEntryId]".`);
    else {
      const describe = entries.map((e) => `${e.Pricebook2?.Name}: ${e.UnitPrice} (${e.ProductSellingModel?.Name ?? "no selling model"}${e.IsActive ? "" : ", inactive"})`).join("; ");
      const plain = standardEntries.filter((e) => !e.ProductSellingModelId);
      if (plain.length && models.length)
        add("Price entries", "warn", `${describe}. It also has a standard entry with no selling model, alongside the selling-model ones; products that price correctly in Revenue Cloud usually have only selling-model entries, so this extra entry may be what pricing picks up.`);
      else add("Price entries", "pass", describe);
    }

    // 5. Catalog and category (Browse Catalog / Product Discovery).
    const placements = await records<any>(conn, `SELECT ProductCategory.Name, Catalog.Name, Catalog.EffectiveStartDate, Catalog.EffectiveEndDate FROM ProductCategoryProduct WHERE ProductId = '${id}'`);
    if (placements.length === 0) add("Catalog", "fail", "Not in any catalog category: it won't appear in Browse Catalog.");
    else {
      const expired = placements.filter((p) => p.Catalog?.EffectiveEndDate && p.Catalog.EffectiveEndDate < now);
      add("Catalog", expired.length === placements.length ? "fail" : "pass", placements.map((p) => `${p.Catalog?.Name} › ${p.ProductCategory?.Name}${p.Catalog?.EffectiveEndDate && p.Catalog.EffectiveEndDate < now ? " (catalog expired)" : ""}`).join("; "));
    }

    // 6. Pricing data sync: pricing reads list prices from decision tables built from the price book.
    const sync = await optionalSection(async () =>
      records<any>(conn, "SELECT DeveloperName, LastSyncDate, IsIncrementalSyncEnabled, LastIncrementalSyncDate FROM DecisionTable WHERE SourceObject = 'PricebookEntry' AND Status = 'Active'")
    );
    const newestPrice = entries.map((e) => e.LastModifiedDate as string).sort().pop();
    if (!sync.available) add("Pricing data sync", "not checked", sync.note);
    else if (sync.data.length === 0) add("Pricing data sync", "not checked", "No price book decision tables found.");
    else {
      const stale = sync.data.filter((t) => newestPrice && !t.IsIncrementalSyncEnabled && (!t.LastSyncDate || t.LastSyncDate < newestPrice));
      add(
        "Pricing data sync",
        stale.length ? "fail" : "pass",
        stale.length
          ? `${stale.map((t) => t.DeveloperName).join(", ")} last synced ${stale[0].LastSyncDate?.slice(0, 10) ?? "never"}, before this product's prices changed (${newestPrice?.slice(0, 10)}): pricing can't see them. Run Sync Pricing Data.`
          : `Price book decision tables synced after this product's latest price change.`
      );
    }

    // 7. Evidence: how its recent quote lines priced.
    const lines = await records<any>(conn, `SELECT Quote.QuoteNumber, ListPrice, UnitPrice, NetTotalPrice, CreatedDate FROM QuoteLineItem WHERE Product2Id = '${id}' ORDER BY CreatedDate DESC LIMIT 20`);
    // Renewal lines leave UnitPrice empty and carry the price in NetTotalPrice.
    const zero = lines.filter((l) => (l.ListPrice ?? 0) > 0 && !(l.UnitPrice > 0) && !(l.NetTotalPrice > 0));
    if (lines.length === 0) add("Quote lines", "not checked", "Not on any quote yet.");
    else add("Quote lines", zero.length ? "fail" : "pass", zero.length ? `${zero.length} of its last ${lines.length} quote lines have a list price but a unit price of 0 (e.g. quote ${zero[0].Quote?.QuoteNumber}): pricing ran but produced no price.` : `Its last ${lines.length} quote lines are priced.`);

    add("Product Discovery index", "not checked", "Index status isn't readable through the API; if the product is missing from search but every check above passes, rebuild the index in Setup.");

    const firstFail = checks.find((c) => c.status === "fail");
    let likelyCause = firstFail ? `${firstFail.area}: ${firstFail.detail}` : "No problem found in the checks the API allows.";
    const pricingOnly = firstFail?.area === "Quote lines" && checks.every((c) => c.status !== "fail" || c.area === "Quote lines");
    if (pricingOnly) {
      likelyCause =
        "The product is set up correctly and its pricing data is synced, but Revenue Cloud's pricing procedure returns 0 for it. Check the pricing procedure's list-price step and any conditions (selling model, pricing term, currency) it applies; use explain_price on one of its quote lines.";
    }
    return { ok: true, data: { product: { id: product.Id, name: product.Name, productCode: product.ProductCode ?? null }, checks, likelyCause }, meta: meta() };
  } catch (err) {
    return failure(err);
  }
}
