import { describe, expect, it, vi } from "vitest";
import type { Connection } from "jsforce";
import { SalesforceRevenueGateway } from "../src/salesforce/salesforceGateway.js";

const discount = { quoteId: "0Q0000000000001", quoteLineId: "0QL000000000001", discountPercent: 20, idempotencyKey: "k", confirmedByUser: true };

function gatewayReturning(result: unknown) {
  const conn = { requestPost: vi.fn().mockResolvedValue([result]) } as unknown as Connection;
  return new SalesforceRevenueGateway(conn);
}

describe("Revenue Cloud flow actions", () => {
  it("reports a failure the flow returns in its own outputs, not a false success", async () => {
    const gateway = gatewayReturning({ isSuccess: true, outputValues: { isSuccess: false, errorMessage: "Quote line is not priced" }, errors: null });
    const result = await gateway.applyDiscount(discount);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.message).toBe("Quote line is not priced");
  });

  it("still succeeds when both the action and the flow succeed", async () => {
    const gateway = gatewayReturning({ isSuccess: true, outputValues: { isSuccess: true }, errors: null });
    expect((await gateway.applyDiscount(discount)).ok).toBe(true);
  });
});
