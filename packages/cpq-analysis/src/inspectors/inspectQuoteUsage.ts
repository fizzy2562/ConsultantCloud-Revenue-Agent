import type { Connection } from "jsforce";

// Scoping boundary: CPQ provides no execution ledger for Price Rules or Discount Schedules,
// so this inspector reports only directly-observable product-level quoting activity.

function meta(source: "salesforce" = "salesforce") {
  return { requestId: crypto.randomUUID(), durationMs: 0, source };
}

export interface ProductUsageCount {
  productId: string;
  quoteLineCountAllTime: number;
  quoteLineCountLast365Days: number;
}

export interface InspectQuoteUsageData {
  quoteLinesTotal: number;
  earliestQuoteLineDate: string | null;
  latestQuoteLineDate: string | null;
  productUsage: ProductUsageCount[];
}

export type InspectQuoteUsageResult =
  | { ok: true; data: InspectQuoteUsageData; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const inspectQuoteUsageTool = {
  name: "inspect_quote_usage",
  title: "Inspect Quote Usage",
  description: "Reports which catalog products have actually been quoted (all-time and in the last 365 days), using real Quote Line records, plus the observed date range of that data. Deliberately does not attempt to attribute usage to Price Rules or Discount Schedules -- CPQ provides no execution ledger for those. Read-only.",
  kind: "read" as const,
  inputSchema: { type: "object", properties: {}, required: [] },
};

export async function inspectQuoteUsageHandler(conn: Connection, input: Record<string, never>): Promise<InspectQuoteUsageResult> {
  try {
    const [countResult, rangeResult, allTimeResult, recentResult] = await Promise.all([
      conn.query<any>(`SELECT COUNT() FROM SBQQ__QuoteLine__c WHERE SBQQ__Product__c != null`),
      conn.query<any>(`SELECT MIN(CreatedDate) minD, MAX(CreatedDate) maxD FROM SBQQ__QuoteLine__c WHERE SBQQ__Product__c != null`),
      conn.query<any>(`SELECT SBQQ__Product__c, COUNT(Id) allTime FROM SBQQ__QuoteLine__c WHERE SBQQ__Product__c != null GROUP BY SBQQ__Product__c LIMIT 2000`),
      conn.query<any>(`SELECT SBQQ__Product__c, COUNT(Id) recent FROM SBQQ__QuoteLine__c WHERE SBQQ__Product__c != null AND CreatedDate = LAST_N_DAYS:365 GROUP BY SBQQ__Product__c LIMIT 2000`),
    ]);

    const quoteLinesTotal: number = countResult.totalSize;

    const rangeRow = rangeResult.records[0];
    const earliestQuoteLineDate: string | null = rangeRow ? (rangeRow.minD ?? null) : null;
    const latestQuoteLineDate: string | null = rangeRow ? (rangeRow.maxD ?? null) : null;

    const allTimeMap = new Map<string, number>();
    for (const r of allTimeResult.records) {
      const pid: string | null = r.SBQQ__Product__c;
      if (pid) allTimeMap.set(pid, r.allTime);
    }

    const recentMap = new Map<string, number>();
    for (const r of recentResult.records) {
      const pid: string | null = r.SBQQ__Product__c;
      if (pid) recentMap.set(pid, r.recent);
    }

    const productIds = new Set<string>([...allTimeMap.keys(), ...recentMap.keys()]);
    const productUsage: ProductUsageCount[] = [...productIds].map((productId) => ({
      productId,
      quoteLineCountAllTime: allTimeMap.get(productId) ?? 0,
      quoteLineCountLast365Days: recentMap.get(productId) ?? 0,
    }));

    const data: InspectQuoteUsageData = { quoteLinesTotal, earliestQuoteLineDate, latestQuoteLineDate, productUsage };
    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
