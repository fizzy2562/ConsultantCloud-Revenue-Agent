import type { Connection } from "jsforce";

function meta(source: "salesforce" = "salesforce") {
  return { requestId: crypto.randomUUID(), durationMs: 0, source };
}

function escapeSoql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapeSoqlLike(value: string): string {
  return escapeSoql(value).replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export interface DiscountTier {
  id: string;
  scheduleId: string | null;
  name: string;
  number: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  discount: number | null;
  discountAmount: number | null;
  price: number | null;
}

export interface DiscountScheduleSummary {
  id: string;
  name: string;
  type: string | null;
  discountUnit: string | null;
  product: string | null;
  description: string | null;
  tiers: DiscountTier[];
}

export interface InspectDiscountSchedulesData {
  discountSchedules: DiscountScheduleSummary[];
}

export type InspectDiscountSchedulesResult =
  | { ok: true; data: InspectDiscountSchedulesData; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const inspectDiscountSchedulesTool = {
  name: "inspect_discount_schedules",
  title: "Inspect Discount Schedules",
  description: "Inventories SBQQ CPQ Discount Schedules with their tiers, for migration-readiness analysis. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
};

export async function inspectDiscountSchedulesHandler(conn: Connection, input: Record<string, never>): Promise<InspectDiscountSchedulesResult> {
  try {
    const schedulesResult = await conn.query<any>(
      `SELECT Id, Name, SBQQ__Type__c, SBQQ__DiscountUnit__c, SBQQ__Product__c, SBQQ__Pricebook__c, SBQQ__Account__c, SBQQ__Description__c FROM SBQQ__DiscountSchedule__c ORDER BY Name ASC LIMIT 50`
    );
    const scheduleRows = schedulesResult.records;

    let tierRows: any[] = [];
    if (scheduleRows.length > 0) {
      const ids = scheduleRows.map((r) => r.Id);
      const tiersResult = await conn.query<any>(
        `SELECT Id, SBQQ__Schedule__c, Name, SBQQ__Number__c, SBQQ__LowerBound__c, SBQQ__UpperBound__c, SBQQ__Discount__c, SBQQ__DiscountAmount__c, SBQQ__Price__c FROM SBQQ__DiscountTier__c WHERE SBQQ__Schedule__c IN ('${ids.join("','")}') ORDER BY SBQQ__Number__c ASC NULLS LAST`
      );
      tierRows = tiersResult.records;
    }

    const tiersBySchedule = new Map<string, DiscountTier[]>();
    for (const t of tierRows) {
      const scheduleId = t.SBQQ__Schedule__c ?? null;
      if (scheduleId == null) continue;
      const tier: DiscountTier = {
        id: t.Id,
        scheduleId,
        name: t.Name,
        number: t.SBQQ__Number__c ?? null,
        lowerBound: t.SBQQ__LowerBound__c ?? null,
        upperBound: t.SBQQ__UpperBound__c ?? null,
        discount: t.SBQQ__Discount__c ?? null,
        discountAmount: t.SBQQ__DiscountAmount__c ?? null,
        price: t.SBQQ__Price__c ?? null,
      };
      const existing = tiersBySchedule.get(scheduleId);
      if (existing) {
        existing.push(tier);
      } else {
        tiersBySchedule.set(scheduleId, [tier]);
      }
    }

    const discountSchedules: DiscountScheduleSummary[] = scheduleRows.map((s) => ({
      id: s.Id,
      name: s.Name,
      type: s.SBQQ__Type__c ?? null,
      discountUnit: s.SBQQ__DiscountUnit__c ?? null,
      product: s.SBQQ__Product__c ?? null,
      description: s.SBQQ__Description__c ?? null,
      tiers: tiersBySchedule.get(s.Id) ?? [],
    }));

    const data: InspectDiscountSchedulesData = { discountSchedules };
    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
