import type { Connection } from "jsforce";
import { repriceQuote } from "@consultantcloud/revenue-mcp";

/**
 * Sets up the records the User-mode demo needs in a real Revenue Cloud org, idempotently:
 *  1. the demo accounts;
 *  2. the demo products, each with a price book entry tied to a selling model, which Revenue
 *     Cloud needs before a product can go on a quote (without one, adding a line fails with
 *     "Required fields are missing: [PricebookEntryId]");
 *  3. Acme University's current subscription, as real assets (quote, order, activate, assets),
 *     so there is something to renew;
 *  4. an open Acme quote with a Cloud Pro line, so there is something to discount.
 * Every step reports what it found or did; a failed step doesn't stop the ones that don't need it.
 */
export type StepResult = { step: string; status: "done" | "already there" | "pending" | "failed"; detail: string };

const API = "v62.0";
const ACCOUNTS = [
  { name: "Acme University", industry: "Education" },
  { name: "Greenfield Health", industry: "Healthcare" },
];
const PRODUCTS = [
  { name: "Cloud Essentials", price: 1200 },
  { name: "Cloud Pro", price: 2400 },
  { name: "Premium Support", price: 800 },
];
const SELLING_MODEL = "Term Based - Yearly";
const SUBSCRIPTION_SEATS = 100;
const OPEN_QUOTE_NAME = "Acme University - Expansion (demo)";
const SUBSCRIPTION_QUOTE_NAME = "Acme University - Current subscription (demo)";
// Salesforce won't activate an order without these; fictional, for the demo account only.
const DEMO_ADDRESS = { Street: "1 University Avenue", City: "Dublin", PostalCode: "D02 X285", Country: "Ireland" };
const BILLING_CONTACT = { FirstName: "Dana", LastName: "Whitfield", Email: "dana.whitfield@example.com", Title: "Procurement Manager" };

type Rec = Record<string, unknown> & { Id: string };

const q = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function query<T extends Rec = Rec>(conn: Connection, soql: string): Promise<T[]> {
  return (await conn.query<T>(soql)).records;
}

async function flow(conn: Connection, name: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const [result] = await conn.requestPost<Array<{ isSuccess: boolean; outputValues: Record<string, unknown> | null; errors: unknown }>>(
    `/services/data/${API}/actions/custom/flow/${name}`,
    { inputs: [input] }
  );
  const out = result?.outputValues ?? {};
  if (!result?.isSuccess || out.isSuccess === false) {
    throw new Error(String(out.errorMessage ?? JSON.stringify(result?.errors ?? "failed")));
  }
  return out;
}

async function standardAction(conn: Connection, name: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const [result] = await conn.requestPost<Array<{ isSuccess: boolean; outputValues: Record<string, unknown> | null; errors: Array<{ message?: string }> | null }>>(
    `/services/data/${API}/actions/standard/${name}`,
    { inputs: [input] }
  );
  if (!result?.isSuccess) throw new Error(result?.errors?.map((e) => e.message).join("; ") || `${name} failed`);
  return result.outputValues ?? {};
}

async function waitFor<T>(check: () => Promise<T | null | undefined>, timeoutMs: number, everyMs = 2000): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) return null;
    await sleep(everyMs);
  }
}

export async function setUpDemoData(conn: Connection): Promise<StepResult[]> {
  const results: StepResult[] = [];
  const record = (step: string, status: StepResult["status"], detail: string) => results.push({ step, status, detail });

  // 1. Accounts.
  const accountIds = new Map<string, string>();
  for (const account of ACCOUNTS) {
    try {
      const [existing] = await query(conn, `SELECT Id FROM Account WHERE Name = '${q(account.name)}' LIMIT 1`);
      if (existing) {
        accountIds.set(account.name, existing.Id);
        record(`Account: ${account.name}`, "already there", existing.Id);
      } else {
        const created = await conn.sobject("Account").create({ Name: account.name, Industry: account.industry });
        accountIds.set(account.name, created.id as string);
        record(`Account: ${account.name}`, "done", "created");
      }
    } catch (error) {
      record(`Account: ${account.name}`, "failed", message(error));
    }
  }

  // 2. Products, each with a selling model and a price book entry for that selling model.
  const productIds = new Map<string, string>();
  let sellingModelId: string | undefined;
  let pricebookId: string | undefined;
  try {
    const [model] = await query(conn, `SELECT Id FROM ProductSellingModel WHERE Name = '${q(SELLING_MODEL)}' AND Status = 'Active' LIMIT 1`);
    const [standard] = await query(conn, "SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1");
    sellingModelId = model?.Id;
    pricebookId = standard?.Id;
    if (!sellingModelId) throw new Error(`no active "${SELLING_MODEL}" selling model in this org`);
    if (!pricebookId) throw new Error("no standard price book");
  } catch (error) {
    record("Selling model and price book", "failed", message(error));
  }
  for (const product of PRODUCTS) {
    const step = `Product: ${product.name}`;
    try {
      let [existing] = await query(conn, `SELECT Id FROM Product2 WHERE Name = '${q(product.name)}' LIMIT 1`);
      const notes: string[] = [];
      if (!existing) {
        const created = await conn.sobject("Product2").create({ Name: product.name, IsActive: true, Family: "Software" });
        existing = { Id: created.id as string };
        notes.push("created");
      }
      productIds.set(product.name, existing.Id);
      if (sellingModelId && pricebookId) {
        const [option] = await query(conn, `SELECT Id FROM ProductSellingModelOption WHERE Product2Id = '${existing.Id}' AND ProductSellingModelId = '${sellingModelId}' LIMIT 1`);
        if (!option) {
          await conn.sobject("ProductSellingModelOption").create({ Product2Id: existing.Id, ProductSellingModelId: sellingModelId });
          notes.push("selling model added");
        }
        const [plain] = await query(conn, `SELECT Id FROM PricebookEntry WHERE Product2Id = '${existing.Id}' AND Pricebook2Id = '${pricebookId}' AND ProductSellingModelId = null LIMIT 1`);
        if (!plain) {
          await conn.sobject("PricebookEntry").create({ Pricebook2Id: pricebookId, Product2Id: existing.Id, UnitPrice: product.price, IsActive: true });
          notes.push("standard price added");
        }
        const [entry] = await query(conn, `SELECT Id FROM PricebookEntry WHERE Product2Id = '${existing.Id}' AND Pricebook2Id = '${pricebookId}' AND ProductSellingModelId = '${sellingModelId}' LIMIT 1`);
        if (!entry) {
          await conn.sobject("PricebookEntry").create({ Pricebook2Id: pricebookId, Product2Id: existing.Id, ProductSellingModelId: sellingModelId, UnitPrice: product.price, IsActive: true });
          notes.push(`${SELLING_MODEL} price added`);
        }
      }
      record(step, notes.length ? "done" : "already there", notes.join(", ") || "ready to quote");
    } catch (error) {
      record(step, "failed", message(error));
    }
  }

  // 2b. Revenue Cloud prices from decision tables built from the price book. They only see
  // entries that existed at their last sync, so new demo prices read as 0 until a sync runs.
  try {
    const demoIds = [...productIds.values()].map((id) => `'${id}'`).join(", ");
    const [newest] = demoIds
      ? await query<Rec & { LastModifiedDate: string }>(conn, `SELECT Id, LastModifiedDate FROM PricebookEntry WHERE Product2Id IN (${demoIds}) ORDER BY LastModifiedDate DESC LIMIT 1`)
      : [];
    const tables = await query<Rec & { DeveloperName: string; LastSyncDate: string | null }>(
      conn,
      "SELECT Id, DeveloperName, LastSyncDate FROM DecisionTable WHERE SourceObject = 'PricebookEntry' AND Status = 'Active'"
    );
    const stale = tables.filter((t) => newest && (!t.LastSyncDate || t.LastSyncDate < newest.LastModifiedDate));
    if (!newest || tables.length === 0) {
      record("Pricing data sync", "already there", tables.length ? "no demo prices to sync" : "no price book decision tables found");
    } else if (stale.length === 0) {
      record("Pricing data sync", "already there", "the price book decision tables include the demo prices");
    } else {
      try {
        // Salesforce's Sync Pricing Data API starts the sync on a GET.
        await conn.requestGet(`/services/data/${API}/connect/core-pricing/sync/syncData`);
        record("Pricing data sync", "pending", `started; ${stale.map((t) => t.DeveloperName).join(", ")} will include the demo prices when it finishes (usually a minute or two). Run this again to check.`);
      } catch (error) {
        record(
          "Pricing data sync",
          "failed",
          `${message(error)}. The demo products will price at 0 until it runs: Setup → Salesforce Pricing Setup → Sync Pricing Data (last sync ${stale[0]!.LastSyncDate?.slice(0, 10) ?? "never"}).`
        );
      }
    }
  } catch (error) {
    record("Pricing data sync", "failed", message(error));
  }

  const acmeId = accountIds.get("Acme University");
  const cloudProId = productIds.get("Cloud Pro");
  if (!acmeId || !cloudProId || !sellingModelId) {
    record("Acme subscription and open quote", "failed", "needs the Acme account, the Cloud Pro product and its selling model (see above)");
    return results;
  }

  /** A new draft quote on Acme with a Cloud Pro line, through Revenue Cloud's own quoting actions. */
  const quoteWithLine = async (name: string, seats: number): Promise<string> => {
    const [opportunity] = await query(conn, `SELECT Id FROM Opportunity WHERE AccountId = '${acmeId}' AND IsClosed = false LIMIT 1`);
    const opportunityId =
      opportunity?.Id ??
      ((await conn.sobject("Opportunity").create({
        Name: "Acme University - Demo",
        AccountId: acmeId,
        StageName: "Qualification",
        CloseDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      })).id as string);
    const created = await flow(conn, "quotingAI__createInitialQuoteOnOpp", { opportunityID: opportunityId });
    const quoteId = String(created.quoteId ?? created.quoteID ?? created.recordId ?? "");
    const resolvedQuoteId =
      quoteId ||
      (await query(conn, `SELECT Id FROM Quote WHERE OpportunityId = '${opportunityId}' ORDER BY CreatedDate DESC LIMIT 1`))[0]?.Id;
    if (!resolvedQuoteId) throw new Error("the quote was not created");
    await conn.sobject("Quote").update({ Id: resolvedQuoteId, Name: name });
    await flow(conn, "quotingAI__addQuoteLineItemToQuote", {
      quoteId: resolvedQuoteId,
      productId: cloudProId,
      quantity: seats,
      productSellingModelID: sellingModelId,
    });
    const line = await waitFor(
      async () => (await query(conn, `SELECT Id FROM QuoteLineItem WHERE QuoteId = '${resolvedQuoteId}' AND Product2Id = '${cloudProId}' LIMIT 1`))[0],
      30000
    );
    if (!line) throw new Error("the Cloud Pro line did not appear on the quote");
    const pricingError = await repriceQuote(conn, resolvedQuoteId);
    if (pricingError) console.warn(`Demo quote ${resolvedQuoteId}: pricing failed: ${pricingError}`);
    return resolvedQuoteId;
  };

  // 3. Acme's current subscription: real assets, so the renewal has something to renew.
  try {
    const [asset] = await query(conn, `SELECT Id FROM Asset WHERE AccountId = '${acmeId}' AND Product2Id = '${cloudProId}' AND LifecycleStartDate != null LIMIT 1`);
    if (asset) {
      record("Acme: current subscription (assets)", "already there", asset.Id);
    } else {
      // Reuse the subscription order from an earlier run if there is one; otherwise quote, then order.
      const [earlier] = await query(
        conn,
        `SELECT Id, Status FROM Order WHERE AccountId = '${acmeId}' AND QuoteId IN (SELECT Id FROM Quote WHERE Name = '${q(SUBSCRIPTION_QUOTE_NAME)}') ORDER BY CreatedDate DESC LIMIT 1`
      );
      let orderId = earlier?.Id;
      if (!orderId) {
        const quoteId = await quoteWithLine(SUBSCRIPTION_QUOTE_NAME, SUBSCRIPTION_SEATS);
        const order = await standardAction(conn, "createOrderFromQuote", { quoteRecordId: quoteId });
        orderId =
          (order.orderId as string | undefined) ??
          (await waitFor(async () => (await query(conn, `SELECT Id FROM Order WHERE QuoteId = '${quoteId}' LIMIT 1`))[0]?.Id, 45000)) ??
          undefined;
      }
      if (!orderId) throw new Error("the order from the quote did not appear within 45 seconds");
      const items = await waitFor(async () => (await query(conn, `SELECT Id FROM OrderItem WHERE OrderId = '${orderId}' LIMIT 1`))[0], 45000);
      if (!items) throw new Error(`order ${orderId} has no items yet`);
      if (earlier?.Status !== "Activated") {
        // Activation needs billing and shipping addresses and a bill-to contact.
        const address = (prefix: "Billing" | "Shipping") =>
          Object.fromEntries(Object.entries(DEMO_ADDRESS).map(([field, value]) => [`${prefix}${field}`, value]));
        const [account] = await query(conn, `SELECT Id, BillingStreet, ShippingStreet FROM Account WHERE Id = '${acmeId}'`);
        await conn.sobject("Account").update({
          Id: acmeId,
          ...(account?.BillingStreet ? {} : address("Billing")),
          ...(account?.ShippingStreet ? {} : address("Shipping")),
        });
        const [contact] = await query(conn, `SELECT Id FROM Contact WHERE AccountId = '${acmeId}' AND Email = '${q(BILLING_CONTACT.Email)}' LIMIT 1`);
        const contactId = contact?.Id ?? ((await conn.sobject("Contact").create({ ...BILLING_CONTACT, AccountId: acmeId })).id as string);
        await conn.sobject("Order").update({ Id: orderId, BillToContactId: contactId, ...address("Billing"), ...address("Shipping") });
        await conn.sobject("Order").update({ Id: orderId, Status: "Activated" });
      }
      // Many orgs create assets on activation by themselves; ask for them only if none appear,
      // or the account ends up with duplicate subscriptions.
      const findAsset = async () =>
        (await query(conn, `SELECT Id FROM Asset WHERE AccountId = '${acmeId}' AND Product2Id = '${cloudProId}' AND LifecycleStartDate != null LIMIT 1`))[0];
      if (!(await waitFor(findAsset, 20000))) await standardAction(conn, "createOrUpdateAssetFromOrder", { orderId });
      const created = await waitFor(
        async () => (await query(conn, `SELECT Id FROM Asset WHERE AccountId = '${acmeId}' AND Product2Id = '${cloudProId}' AND LifecycleStartDate != null LIMIT 1`))[0],
        45000
      );
      if (created) record("Acme: current subscription (assets)", "done", `${SUBSCRIPTION_SEATS} Cloud Pro seats, from order ${orderId}`);
      else record("Acme: current subscription (assets)", "pending", `order ${orderId} activated; Salesforce is still creating the assets. Run this again in a minute to check.`);
    }
  } catch (error) {
    record("Acme: current subscription (assets)", "failed", message(error));
  }

  // 4. An open quote with a Cloud Pro line, for the discount scenarios.
  try {
    const [open] = await query(
      conn,
      `SELECT Id, Name FROM Quote WHERE AccountId = '${acmeId}' AND Name = '${q(OPEN_QUOTE_NAME)}' AND Id IN (SELECT QuoteId FROM QuoteLineItem WHERE Product2Id = '${cloudProId}') LIMIT 1`
    );
    if (open) record("Acme: open quote with a Cloud Pro line", "already there", open.Id);
    else record("Acme: open quote with a Cloud Pro line", "done", await quoteWithLine(OPEN_QUOTE_NAME, SUBSCRIPTION_SEATS));
  } catch (error) {
    record("Acme: open quote with a Cloud Pro line", "failed", message(error));
  }

  return results;
}
