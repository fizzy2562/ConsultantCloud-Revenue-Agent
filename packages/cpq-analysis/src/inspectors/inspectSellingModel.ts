import type { Connection } from "jsforce";

function meta(source: "salesforce" = "salesforce") {
  return { requestId: crypto.randomUUID(), durationMs: 0, source };
}

export interface ProductSellingModelFields {
  id: string;
  name: string;
  chargeType: string | null;
  productSubscriptionType: string | null;
  subscriptionTerm: number | null;
  hasConsumptionSchedule: boolean;
}

export interface ProductSubscriptionTypeCount {
  productId: string;
  subscriptionType: string | null;
  count: number;
}

export interface InspectSellingModelData {
  productsTotalActive: number;
  products: ProductSellingModelFields[];
  subscriptionTypesByProduct: ProductSubscriptionTypeCount[];
}

export type InspectSellingModelResult =
  | { ok: true; data: InspectSellingModelData; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const inspectSellingModelTool = {
  name: "inspect_selling_model",
  title: "Inspect Product Selling Model Signals",
  description: "Gathers catalog-level selling-model fields (charge type, subscription type/term, consumption schedule) from Product2, plus how each product has actually been sold according to real Subscription records, as raw evidence for a downstream selling-model classification. Read-only.",
  kind: "read" as const,
  inputSchema: { type: "object", properties: {}, required: [] },
};

export async function inspectSellingModelHandler(conn: Connection, input: Record<string, never>): Promise<InspectSellingModelResult> {
  // A real selling-model classification must cover the whole catalog (hence LIMIT 2000, not the 100 used elsewhere),
  // and needs a second, transactional evidence source (real Subscription records) because catalog fields alone are
  // often unconfigured defaults -- so we run a separate grouped aggregate rather than one big join.
  try {
    const [countResult, productsResult, subscriptionResult] = await Promise.all([
      conn.query<any>(`SELECT COUNT() FROM Product2 WHERE IsActive = true`),
      conn.query<any>(`SELECT Id, Name, SBQQ__ChargeType__c, SBQQ__SubscriptionType__c, SBQQ__SubscriptionTerm__c, SBQQ__HasConsumptionSchedule__c FROM Product2 WHERE IsActive = true ORDER BY Name ASC LIMIT 2000`),
      conn.query<any>(`SELECT SBQQ__Product__c, SBQQ__SubscriptionType__c, COUNT(Id) cnt FROM SBQQ__Subscription__c WHERE SBQQ__Product__c != null GROUP BY SBQQ__Product__c, SBQQ__SubscriptionType__c LIMIT 2000`),
    ]);

    const data: InspectSellingModelData = {
      productsTotalActive: countResult.totalSize,
      products: productsResult.records.map((r: any) => ({
        id: r.Id,
        name: r.Name,
        chargeType: r.SBQQ__ChargeType__c ?? null,
        productSubscriptionType: r.SBQQ__SubscriptionType__c ?? null,
        subscriptionTerm: r.SBQQ__SubscriptionTerm__c ?? null,
        hasConsumptionSchedule: r.SBQQ__HasConsumptionSchedule__c ?? false,
      })),
      subscriptionTypesByProduct: subscriptionResult.records.map((row: any) => ({
        productId: row.SBQQ__Product__c,
        subscriptionType: row.SBQQ__SubscriptionType__c ?? null,
        count: row.cnt,
      })),
    };

    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
