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

export interface RevenueOrderItem {
  id: string;
  productId: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
}

export interface RevenueOrderStatus {
  id: string;
  name: string | null;
  status: string | null;
  effectiveDate: string | null;
  totalAmount: number | null;
  accountId: string | null;
  orderNumber: string | null;
  quoteId: string | null;
  items: RevenueOrderItem[];
}

export type getRevenueOrderStatusResult =
  | { ok: true; data: RevenueOrderStatus; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const getRevenueOrderStatusTool = {
  name: "get_revenue_order_status",
  title: "Get Revenue Order Status",
  description: "Looks up an Order by orderId or by quoteId, returning its header fields and OrderItem lines. Read-only.",
  kind: "read" as const,
  inputSchema: {
    type: "object",
    properties: {
      orderId: { type: "string", description: "The Order Id to look up directly." },
      quoteId: { type: "string", description: "The Quote Id the Order originated from, used to find the Order." },
    },
    required: [],
  },
};

export async function getRevenueOrderStatusHandler(
  conn: Connection,
  input: { orderId?: string; quoteId?: string }
): Promise<getRevenueOrderStatusResult> {
  if (!input.orderId && !input.quoteId) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "orderId or quoteId is required", retryable: false }, meta: meta() };
  }

  try {
    const filter = input.orderId
      ? `Id = '${escapeSoql(input.orderId)}'`
      : `QuoteId = '${escapeSoql(input.quoteId as string)}'`;

    const orderResult = await conn.query<any>(`SELECT Id, Name, Status, EffectiveDate, TotalAmount, AccountId, OrderNumber, QuoteId FROM Order WHERE ${filter}`);
    const order = orderResult.records[0];
    if (!order) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Order not found", retryable: false }, meta: meta() };
    }

    const itemsResult = await conn.query<any>(`SELECT Id, OrderId, Product2Id, Quantity, UnitPrice, TotalPrice FROM OrderItem WHERE OrderId = '${escapeSoql(order.Id)}'`);
    const items: RevenueOrderItem[] = itemsResult.records.map((r: any) => ({
      id: r.Id,
      productId: r.Product2Id ?? null,
      quantity: r.Quantity ?? null,
      unitPrice: r.UnitPrice ?? null,
      totalPrice: r.TotalPrice ?? null,
    }));

    return {
      ok: true,
      data: {
        id: order.Id,
        name: order.Name ?? null,
        status: order.Status ?? null,
        effectiveDate: order.EffectiveDate ?? null,
        totalAmount: order.TotalAmount ?? null,
        accountId: order.AccountId ?? null,
        orderNumber: order.OrderNumber ?? null,
        quoteId: order.QuoteId ?? null,
        items,
      },
      meta: meta(),
    };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
