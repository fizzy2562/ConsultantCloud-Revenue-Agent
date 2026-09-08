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

export interface ProrationPolicyDetail {
  id: string;
  name: string;
  prorationPolicyType: string | null;
  remainderStrategy: string | null;
  arePartialPeriodsAllowed: boolean;
}

export interface SellingModelDetail {
  id: string;
  name: string;
  sellingModelType: string | null;
  pricingTerm: number | null;
  pricingTermUnit: string | null;
  status: string | null;
}

export interface SubscriptionPricingDetail {
  prorationPolicy: ProrationPolicyDetail | null;
  sellingModel: SellingModelDetail | null;
}

export interface ToolResultMeta {
  requestId: string;
  durationMs: number;
  source: "salesforce";
}

export interface ToolResultSuccess<T> {
  ok: true;
  data: T;
  meta: ToolResultMeta;
}

export interface ToolResultFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  meta: ToolResultMeta;
}

export type getSubscriptionPricingDetailResult =
  | ToolResultSuccess<SubscriptionPricingDetail>
  | ToolResultFailure;

export const getSubscriptionPricingDetailTool = {
  name: "get_subscription_pricing_detail",
  title: "Get Subscription Pricing Detail",
  description: "Looks up a ProrationPolicy by id and/or a ProductSellingModel by id, returning subscription pricing detail. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      prorationPolicyId: { type: "string", description: "Id of the ProrationPolicy record to look up." },
      sellingModelId: { type: "string", description: "Id of the ProductSellingModel record to look up." },
    },
    required: [],
  },
};

export async function getSubscriptionPricingDetailHandler(
  conn: Connection,
  input: { prorationPolicyId?: string; sellingModelId?: string }
): Promise<getSubscriptionPricingDetailResult> {
  if (!input.prorationPolicyId && !input.sellingModelId) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "prorationPolicyId or sellingModelId is required", retryable: false }, meta: meta() };
  }

  try {
    let prorationPolicy: ProrationPolicyDetail | null = null;
    if (input.prorationPolicyId) {
      const records = await conn.query<any>(`SELECT Id, Name, ProrationPolicyType, RemainderStrategy, ArePartialPeriodsAllowed FROM ProrationPolicy WHERE Id = '${escapeSoql(input.prorationPolicyId)}'`);
      const first = records.records[0];
      if (first) {
        prorationPolicy = {
          id: first.Id,
          name: first.Name,
          prorationPolicyType: first.ProrationPolicyType ?? null,
          remainderStrategy: first.RemainderStrategy ?? null,
          arePartialPeriodsAllowed: first.ArePartialPeriodsAllowed ?? false,
        };
      }
    }

    // A direct per-product join between ProrationPolicy/ProductSellingModel and a product is not yet confirmed.
    let sellingModel: SellingModelDetail | null = null;
    if (input.sellingModelId) {
      const records = await conn.query<any>(`SELECT Id, Name, SellingModelType, PricingTerm, PricingTermUnit, Status FROM ProductSellingModel WHERE Id = '${escapeSoql(input.sellingModelId)}'`);
      const first = records.records[0];
      if (first) {
        sellingModel = {
          id: first.Id,
          name: first.Name,
          sellingModelType: first.SellingModelType ?? null,
          pricingTerm: first.PricingTerm ?? null,
          pricingTermUnit: first.PricingTermUnit ?? null,
          status: first.Status ?? null,
        };
      }
    }

    return { ok: true, data: { prorationPolicy, sellingModel }, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
