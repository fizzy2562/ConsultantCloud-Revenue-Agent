import { describe, it, expect } from "vitest";
import { MockRevenueGateway } from "../src/mockGateway.js";
import { ACME_UNIVERSITY_ID, GREENFIELD_HEALTH_ID } from "../src/mockData.js";
import { CreateRenewalQuoteInputSchema, ToolResultSchema } from "../schemas/index.js";
import { z } from "zod";

describe("MockRevenueGateway", () => {
  it("finds Acme University by partial name", async () => {
    const gateway = new MockRevenueGateway();
    const result = await gateway.findAccount({ name: "Acme" });
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].id).toBe(ACME_UNIVERSITY_ID);
  });

  it("finds Greenfield Health by partial name", async () => {
    const gateway = new MockRevenueGateway();
    const result = await gateway.findAccount({ name: "Greenfield" });
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].id).toBe(GREENFIELD_HEALTH_ID);
  });

  it("returns an empty array for an unknown account name, not an error", async () => {
    const gateway = new MockRevenueGateway();
    const result = await gateway.findAccount({ name: "Nonexistent Company Ltd" });
    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(0);
  });

  it("returns the same quoteId when createInitialQuote is called twice with the same idempotencyKey", async () => {
    const gateway = new MockRevenueGateway();
    const input = {
      accountId: ACME_UNIVERSITY_ID,
      termMonths: 12,
      idempotencyKey: "test-key-1",
      confirmedByUser: true,
    };
    const result1 = await gateway.createInitialQuote(input);
    const result2 = await gateway.createInitialQuote(input);
    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    expect(result1.data!.quoteId).toBe(result2.data!.quoteId);
  });

  it("creates an amendment quote with the source quote term", async () => {
    const gateway = new MockRevenueGateway();
    const result = await gateway.createAmendmentQuote({
      accountId: ACME_UNIVERSITY_ID,
      sourceQuoteId: "a0Q000000000001AAA",
      idempotencyKey: "amendment-1",
      confirmedByUser: true,
    });
    expect(result).toMatchObject({ ok: true, data: { status: "Draft" } });
    if (!result.ok) throw new Error("Expected amendment quote creation to succeed");
    const summary = await gateway.getQuoteSummary({ quoteId: result.data.quoteId });
    expect(summary).toMatchObject({ ok: true, data: { termMonths: 36, lines: [] } });
  });

  it("returns NOT_FOUND when the amendment source quote does not exist", async () => {
    const result = await new MockRevenueGateway().createAmendmentQuote({
      accountId: ACME_UNIVERSITY_ID,
      sourceQuoteId: "missing",
      idempotencyKey: "amendment-2",
      confirmedByUser: true,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND", message: "Source quote not found" } });
  });

  it("replays an amendment idempotently without creating a second quote", async () => {
    const gateway = new MockRevenueGateway();
    const input = {
      accountId: ACME_UNIVERSITY_ID,
      sourceQuoteId: "a0Q000000000001AAA",
      idempotencyKey: "amendment-3",
      confirmedByUser: true,
    };
    const first = await gateway.createAmendmentQuote(input);
    const second = await gateway.createAmendmentQuote(input);
    expect(second).toEqual(first);
    const next = await gateway.createInitialQuote({ accountId: ACME_UNIVERSITY_ID, termMonths: 12, idempotencyKey: "after-amendment", confirmedByUser: true });
    expect(next).toMatchObject({ ok: true, data: { quoteNumber: "Q-10002" } });
  });

  it("resolves a quote by quoteNumber alone", async () => {
    const gateway = new MockRevenueGateway();
    const result = await gateway.getQuoteSummary({ quoteNumber: "Q-10000" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.quoteId).toBe("a0Q000000000001AAA");
  });

  it("removes an existing quote line", async () => {
    const gateway = new MockRevenueGateway();
    const result = await gateway.removeQuoteLine({ quoteLineId: "a0L000000000001AAA", idempotencyKey: "remove-1", confirmedByUser: true });
    expect(result).toMatchObject({ ok: true, data: { quoteLineId: "a0L000000000001AAA", removed: true } });
    const summary = await gateway.getQuoteSummary({ quoteId: "a0Q000000000001AAA" });
    expect(summary.ok && summary.data.lines).toHaveLength(0);
  });

  it("returns NOT_FOUND when removing a missing quote line", async () => {
    const result = await new MockRevenueGateway().removeQuoteLine({ quoteLineId: "missing", idempotencyKey: "remove-2", confirmedByUser: true });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("updates quantity and recomputes net price while preserving the discount", async () => {
    const gateway = new MockRevenueGateway();
    const result = await gateway.updateQuoteLine({ quoteLineId: "a0L000000000001AAA", quantity: 2, idempotencyKey: "update-1", confirmedByUser: true });
    expect(result).toMatchObject({ ok: true, data: { quoteLineId: "a0L000000000001AAA", quantity: 2 } });
    const summary = await gateway.getQuoteSummary({ quoteId: "a0Q000000000001AAA" });
    expect(summary.ok && summary.data.lines[0]).toMatchObject({ quantity: 2, discountPercent: 12, netPrice: 4224 });
  });

  it("returns NOT_FOUND when updating a missing quote line", async () => {
    const result = await new MockRevenueGateway().updateQuoteLine({ quoteLineId: "missing", quantity: 2, idempotencyKey: "update-2", confirmedByUser: true });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("ToolResultSchema", () => {
  const schema = ToolResultSchema(z.string());

  it("rejects a success result without data", () => {
    expect(schema.safeParse({ ok: true, meta: { requestId: "request", durationMs: 0, source: "mock" } }).success).toBe(false);
  });

  it("rejects a failure result without an error", () => {
    expect(schema.safeParse({ ok: false, meta: { requestId: "request", durationMs: 0, source: "mock" } }).success).toBe(false);
  });
});

describe("CreateRenewalQuoteInputSchema", () => {
  it("accepts a valid input", () => {
    const input = {
      accountId: ACME_UNIVERSITY_ID,
      termMonths: 36,
      effectiveDate: "2026-10-01",
      idempotencyKey: "demo-key",
      confirmedByUser: true,
    };
    const result = CreateRenewalQuoteInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it("rejects an input missing idempotencyKey", () => {
    const input = {
      accountId: ACME_UNIVERSITY_ID,
      termMonths: 36,
      effectiveDate: "2026-10-01",
      confirmedByUser: true,
    };
    const result = CreateRenewalQuoteInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
