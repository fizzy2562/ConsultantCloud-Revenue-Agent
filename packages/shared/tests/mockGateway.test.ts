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

  it("resolves a quote by quoteNumber alone", async () => {
    const gateway = new MockRevenueGateway();
    const result = await gateway.getQuoteSummary({ quoteNumber: "Q-10000" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.quoteId).toBe("a0Q000000000001AAA");
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
