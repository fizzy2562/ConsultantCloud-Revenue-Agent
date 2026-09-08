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

export interface ContractItemPriceRecord {
  id: string;
  name: string | null;
  contractId: string;
  itemId: string | null;
  productSellingModelId: string | null;
  sellingModelType: string | null;
  price: number | null;
  discountType: string | null;
  discountValue: number | null;
  startDate: string | null;
  endDate: string | null;
  adjTiers: never[];
}

export interface ContractPricingMeta {
  requestId: string;
  durationMs: number;
  source: "salesforce";
}

export interface ContractPricingSuccess {
  ok: true;
  data: ContractItemPriceRecord[];
  meta: ContractPricingMeta;
}

export interface ContractPricingFailure {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
  meta: ContractPricingMeta;
}

export type getContractPricingResult = ContractPricingSuccess | ContractPricingFailure;

export const getContractPricingTool = {
  name: "get_contract_pricing",
  title: "Get Contract Pricing",
  description:
    "Returns ContractItemPrice records for a contract, optionally filtered to one item. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      contractId: { type: "string", description: "The Contract Id to fetch pricing for." },
      itemId: { type: "string", description: "Optional Item Id to scope the pricing to a single item." },
    },
    required: ["contractId"],
  },
};

export async function getContractPricingHandler(
  conn: Connection,
  input: { contractId: string; itemId?: string }
): Promise<getContractPricingResult> {
  try {
    let soql = `SELECT Id, Name, ContractId, ItemId, ProductSellingModelId, SellingModelType, Price, DiscountType, DiscountValue, StartDate, EndDate FROM ContractItemPrice WHERE ContractId = '${escapeSoql(input.contractId)}'`;
    if (input.itemId !== undefined && input.itemId !== "") {
      soql += ` AND ItemId = '${escapeSoql(input.itemId)}'`;
    }
    const records = await conn.query<any>(soql);
    const data: ContractItemPriceRecord[] = records.records.map((r: any) => ({
      id: r.Id,
      name: r.Name ?? null,
      contractId: r.ContractId,
      itemId: r.ItemId ?? null,
      productSellingModelId: r.ProductSellingModelId ?? null,
      sellingModelType: r.SellingModelType ?? null,
      price: r.Price ?? null,
      discountType: r.DiscountType ?? null,
      discountValue: r.DiscountValue ?? null,
      startDate: r.StartDate ?? null,
      endDate: r.EndDate ?? null,
      // This org does not expose ContractItemPriceAdjTier through REST describe.
      adjTiers: [],
    }));
    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
