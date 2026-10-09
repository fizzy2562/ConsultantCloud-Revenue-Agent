import { describe, it, expect, vi } from "vitest";
import { evaluateDiscount } from "../src/discountPolicy.js";
import { requireConfirmation } from "../src/protectedMutations.js";
import { IdempotencyConflictError, IdempotencyStore, withIdempotency } from "../src/idempotencyStore.js";

describe("evaluateDiscount", () => {
  it("permits a 12% discount", () => {
    expect(evaluateDiscount(12).decision).toBe("permitted");
  });

  it("permits a 15% discount (boundary)", () => {
    expect(evaluateDiscount(15).decision).toBe("permitted");
  });

  it("requires approval for a 20% discount", () => {
    expect(evaluateDiscount(20).decision).toBe("approval_required");
  });

  it("requires approval for a 25% discount (boundary)", () => {
    expect(evaluateDiscount(25).decision).toBe("approval_required");
  });

  it("rejects a 30% discount", () => {
    expect(evaluateDiscount(30).decision).toBe("rejected");
  });

  it("rejects a negative discount", () => {
    expect(evaluateDiscount(-5).decision).toBe("rejected");
  });

  it("rejects a NaN discount", () => {
    expect(evaluateDiscount(NaN).decision).toBe("rejected");
  });
});

describe("requireConfirmation", () => {
  it.each(["create_product", "update_product", "set_product_price", "add_bundle_component", "remove_bundle_component", "update_bundle_component"] as const)("protects catalog mutation %s", (action) => {
    expect(requireConfirmation(action, { confirmedByUser: false }).satisfied).toBe(false);
  });
  it("marks an unconfirmed protected mutation as unsatisfied", () => {
    const result = requireConfirmation("create_initial_quote", { confirmedByUser: false });
    expect(result.satisfied).toBe(false);
  });

  it("marks a confirmed protected mutation as satisfied", () => {
    const result = requireConfirmation("create_initial_quote", { confirmedByUser: true });
    expect(result.satisfied).toBe(true);
  });

  it("does not require confirmation for a permitted discount", () => {
    const result = requireConfirmation("apply_discount", {
      discountDecision: "permitted",
      confirmedByUser: false,
    });
    expect(result.required).toBe(false);
    expect(result.satisfied).toBe(true);
  });
});

describe("withIdempotency", () => {
  it("invokes the underlying function only once for repeated keys", async () => {
    const store = new IdempotencyStore<number>();
    let counter = 0;
    const fn = vi.fn(async () => {
      counter += 1;
      return counter;
    });

    const first = await withIdempotency(store, "key-1", "fp-1", fn);
    const second = await withIdempotency(store, "key-1", "fp-1", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("rejects a repeated key with a different payload fingerprint", async () => {
    const store = new IdempotencyStore<number>();

    await withIdempotency(store, "key-1", "fp-1", async () => 1);

    await expect(withIdempotency(store, "key-1", "fp-2", async () => 2)).rejects.toBeInstanceOf(IdempotencyConflictError);
  });
});

describe("discount bands shown to architects", () => {
  it("are derived from the enforced thresholds", async () => {
    const { discountPolicyBands, discountThresholds } = await import("../src/discountPolicy");
    expect(discountPolicyBands).toEqual([
      { minPercent: 0, maxPercent: 15, decision: "permitted" },
      { minPercent: 15, maxPercent: 25, decision: "approval_required", reason: "Discount exceeds 15% and requires manager approval" },
      { minPercent: 25, maxPercent: null, decision: "rejected", reason: "Discount exceeds the maximum permitted threshold of 25%" },
    ]);
    expect(discountPolicyBands).toHaveLength(discountThresholds.length);
  });
});
