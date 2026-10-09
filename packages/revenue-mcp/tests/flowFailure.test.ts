import { describe, expect, it, vi } from "vitest";
import type { Connection } from "jsforce";
import { SalesforceRevenueGateway } from "../src/salesforce/salesforceGateway.js";

const discount = { quoteId: "0Q0000000000001", quoteLineId: "0QL000000000001", discountPercent: 20, idempotencyKey: "k", confirmedByUser: true };
const flowFailure = { isSuccess: true, outputValues: { isSuccess: false, errorMessage: "Invalid Apex Context" }, errors: null };

/** A fake org: the flow action returns `flowResult`; the line's discount reads back as `lineDiscount`. */
function org(flowResult: unknown, lineDiscount: number | null, updateFails = false) {
  const update = vi.fn(async () => {
    if (updateFails) throw new Error("FIELD_INTEGRITY_EXCEPTION");
    return { id: discount.quoteLineId, success: true };
  });
  const conn = {
    requestPost: vi.fn(async (url: string) => (url.includes("/actions/custom/flow/") ? [flowResult] : { success: true })),
    sobject: () => ({ update }),
    query: vi.fn(async () => ({ records: [{ Discount: lineDiscount }] })),
  } as unknown as Connection;
  return { gateway: new SalesforceRevenueGateway(conn), update, conn };
}

describe("applying a discount in Revenue Cloud", () => {
  it("succeeds through the flow when the flow works, and reprices the quote", async () => {
    const { gateway, update, conn } = org({ isSuccess: true, outputValues: { isSuccess: true }, errors: null }, null);
    expect((await gateway.applyDiscount(discount)).ok).toBe(true);
    expect(update).not.toHaveBeenCalled();
    expect((conn.requestPost as ReturnType<typeof vi.fn>).mock.calls.some(([url]) => String(url).includes("/commerce/quotes/actions/place"))).toBe(true);
  });

  it("falls back to setting the line's discount when the flow fails, and succeeds only if it sticks", async () => {
    const { gateway, update } = org(flowFailure, 20);
    const result = await gateway.applyDiscount(discount);
    expect(update).toHaveBeenCalledWith({ Id: discount.quoteLineId, Discount: 20 });
    expect(result).toMatchObject({ ok: true, data: { appliedDiscountPercent: 20 } });
  });

  it("never reports success when the discount doesn't show on the line", async () => {
    const { gateway } = org(flowFailure, null);
    const result = await gateway.applyDiscount(discount);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toMatch(/Invalid Apex Context.*didn't stick/);
  });

  it("reports both errors when the fallback fails too", async () => {
    const { gateway } = org(flowFailure, null, true);
    const result = await gateway.applyDiscount(discount);
    expect(result.ok === false && result.error.message).toMatch(/Invalid Apex Context.*FIELD_INTEGRITY_EXCEPTION/);
  });
});
