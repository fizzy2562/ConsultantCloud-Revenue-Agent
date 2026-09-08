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

export interface PriceAdjustmentTier {
  id: string;
  lowerBound: number | null;
  upperBound: number | null;
  tierType: string | null;
  tierValue: number | null;
  product2Id: string | null;
  productSellingModelId: string | null;
}

export interface PriceAdjustmentSchedule {
  id: string;
  name: string | null;
  description: string | null;
  isActive: boolean;
  scheduleType: string | null;
  adjustmentMethod: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  pricebook2Id: string | null;
  contractId: string | null;
  tiers: PriceAdjustmentTier[];
}

export type PriceAdjustmentScheduleResult =
  | { ok: true; data: PriceAdjustmentSchedule[]; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const getPriceAdjustmentScheduleTool = {
  name: "get_price_adjustment_schedule",
  title: "Get Price Adjustment Schedule",
  description: "Returns the price adjustment schedule(s) and tiers applicable to a given product. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      productId: { type: "string", description: "The Id of the product to look up price adjustment schedules for." },
    },
    required: ["productId"],
  },
};

export async function getPriceAdjustmentScheduleHandler(conn: Connection, input: { productId: string }): Promise<PriceAdjustmentScheduleResult> {
  try {
    const tierRecords = await conn.query<any>(`SELECT Id, PriceAdjustmentScheduleId, LowerBound, UpperBound, TierType, TierValue, Product2Id, ProductSellingModelId FROM PriceAdjustmentTier WHERE Product2Id = '${escapeSoql(input.productId)}'`);

    if (tierRecords.records.length === 0) {
      return { ok: true, data: [], meta: meta() };
    }

    const scheduleIds = Array.from(new Set(tierRecords.records.map((r: any) => r.PriceAdjustmentScheduleId).filter((id: any) => id != null)));

    if (scheduleIds.length === 0) {
      return { ok: true, data: [], meta: meta() };
    }

    const idList = scheduleIds.map((id) => `'${escapeSoql(String(id))}'`).join(", ");
    const scheduleRecords = await conn.query<any>(`SELECT Id, Name, Description, IsActive, ScheduleType, AdjustmentMethod, EffectiveFrom, EffectiveTo, Pricebook2Id, ContractId FROM PriceAdjustmentSchedule WHERE Id IN (${idList})`);

    const tiersBySchedule = new Map<string, PriceAdjustmentTier[]>();
    for (const r of tierRecords.records) {
      const sid = r.PriceAdjustmentScheduleId;
      if (sid == null) continue;
      const key = String(sid);
      const existing = tiersBySchedule.get(key);
      const tier: PriceAdjustmentTier = {
        id: r.Id,
        lowerBound: r.LowerBound ?? null,
        upperBound: r.UpperBound ?? null,
        tierType: r.TierType ?? null,
        tierValue: r.TierValue ?? null,
        product2Id: r.Product2Id ?? null,
        productSellingModelId: r.ProductSellingModelId ?? null,
      };
      if (existing) {
        existing.push(tier);
      } else {
        tiersBySchedule.set(key, [tier]);
      }
    }

    const data: PriceAdjustmentSchedule[] = scheduleRecords.records.map((r: any) => ({
      id: r.Id,
      name: r.Name ?? null,
      description: r.Description ?? null,
      isActive: r.IsActive ?? false,
      scheduleType: r.ScheduleType ?? null,
      adjustmentMethod: r.AdjustmentMethod ?? null,
      effectiveFrom: r.EffectiveFrom ?? null,
      effectiveTo: r.EffectiveTo ?? null,
      pricebook2Id: r.Pricebook2Id ?? null,
      contractId: r.ContractId ?? null,
      tiers: tiersBySchedule.get(String(r.Id)) ?? [],
    }));

    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
