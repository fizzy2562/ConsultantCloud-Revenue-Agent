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

export interface RateCardHeader {
  id: string;
  name: string;
  description: string | null;
  type: string | null;
}

export interface RateCardEntry {
  id: string;
  productId: string;
  rate: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  productSellingModelId: string | null;
  rateCard: RateCardHeader | null;
}

export interface RateCardMeta {
  requestId: string;
  durationMs: number;
  source: "salesforce";
}

export interface RateCardSuccess {
  ok: true;
  data: RateCardEntry[];
  meta: RateCardMeta;
}

export interface RateCardFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  meta: RateCardMeta;
}

export type getRateCardResult = RateCardSuccess | RateCardFailure;

export const getRateCardTool = {
  name: "get_rate_card",
  title: "Get Rate Card",
  description: "Returns RateCardEntry records for a given product, each enriched with its parent RateCard's header fields. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      productId: { type: "string", description: "The Id of the product whose rate card entries to look up." },
    },
    required: ["productId"],
  },
};

export async function getRateCardHandler(conn: Connection, input: { productId: string }): Promise<getRateCardResult> {
  try {
    const entries = await conn.query<any>(`SELECT Id, RateCardId, EffectiveFrom, EffectiveTo, ProductId, Rate, ProductSellingModelId FROM RateCardEntry WHERE ProductId = '${escapeSoql(input.productId)}'`);
    if (entries.records.length === 0) {
      return { ok: true, data: [], meta: meta() };
    }

    const rateCardIds = Array.from(new Set(entries.records.map((r: any) => r.RateCardId).filter((id: any): id is string => typeof id === "string" && id.length > 0)));
    const rateCardMap = new Map<string, RateCardHeader>();
    if (rateCardIds.length > 0) {
      const idList = rateCardIds.map((id) => `'${escapeSoql(id)}'`).join(", ");
      const cards = await conn.query<any>(`SELECT Id, Name, Description, Type, EffectiveFrom, EffectiveTo FROM RateCard WHERE Id IN (${idList})`);
      for (const c of cards.records) {
        rateCardMap.set(c.Id, { id: c.Id, name: c.Name ?? "Unknown", description: c.Description ?? null, type: c.Type ?? null });
      }
    }

    const data: RateCardEntry[] = entries.records.map((r: any) => {
      const rateCard = typeof r.RateCardId === "string" ? rateCardMap.get(r.RateCardId) ?? null : null;
      return {
        id: r.Id,
        productId: r.ProductId ?? null,
        rate: r.Rate ?? null,
        effectiveFrom: r.EffectiveFrom ?? null,
        effectiveTo: r.EffectiveTo ?? null,
        productSellingModelId: r.ProductSellingModelId ?? null,
        rateCard,
      };
    });

    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
