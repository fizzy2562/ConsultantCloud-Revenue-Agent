import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../src/server.js";
import { MockRevenueGateway, ACME_UNIVERSITY_ID } from "@consultantcloud/shared";

type TextToolResult = { content: Array<{ type: string; text: string }> };

async function connectedClient() {
  const gateway = new MockRevenueGateway();
  const server = createServer(gateway);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return { client, gateway };
}

async function callTool(client: InstanceType<typeof Client>, name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args }, CallToolResultSchema)) as TextToolResult;
  const first = result.content[0];
  if (!first || first.type !== "text") throw new Error("expected text content");
  return JSON.parse(first.text);
}

describe("mutation tools", () => {
  it("rejects create_renewal_quote without confirmation, without calling the gateway", async () => {
    const { client, gateway } = await connectedClient();
    const spy = vi.spyOn(gateway, "createRenewalQuote");
    const parsed = await callTool(client, "create_renewal_quote", {
      accountId: ACME_UNIVERSITY_ID,
      termMonths: 36,
      effectiveDate: "2026-10-01",
      idempotencyKey: "t-1",
      confirmedByUser: false,
    });
    expect(parsed.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("creates a renewal quote when confirmed", async () => {
    const { client } = await connectedClient();
    const parsed = await callTool(client, "create_renewal_quote", {
      accountId: ACME_UNIVERSITY_ID,
      termMonths: 36,
      effectiveDate: "2026-10-01",
      idempotencyKey: "t-2",
      confirmedByUser: true,
    });
    expect(parsed.ok).toBe(true);
    expect(typeof parsed.data.quoteId).toBe("string");
    expect(parsed.data.quoteId.length).toBeGreaterThan(0);
  });

  it("permits a 12% discount without confirmation", async () => {
    const { client } = await connectedClient();
    const created = await callTool(client, "create_renewal_quote", {
      accountId: ACME_UNIVERSITY_ID,
      termMonths: 36,
      effectiveDate: "2026-10-01",
      idempotencyKey: "t-3",
      confirmedByUser: true,
    });
    const quoteId = created.data.quoteId;
    const addedLine = await callTool(client, "add_quote_line", {
      quoteId,
      productId: "01t000000000002AAA",
      quantity: 10,
      idempotencyKey: "t-3-line",
      confirmedByUser: true,
    });
    const quoteLineId = addedLine.data.quoteLineId;
    const parsed = await callTool(client, "apply_discount", {
      quoteId,
      quoteLineId,
      discountPercent: 12,
      confirmedByUser: false,
      idempotencyKey: "t-3-discount",
    });
    expect(parsed.ok).toBe(true);
  });

  it("requires confirmation for a 20% discount and does not apply it unconfirmed", async () => {
    const { client } = await connectedClient();
    const created = await callTool(client, "create_renewal_quote", {
      accountId: ACME_UNIVERSITY_ID,
      termMonths: 36,
      effectiveDate: "2026-10-01",
      idempotencyKey: "t-4",
      confirmedByUser: true,
    });
    const quoteId = created.data.quoteId;
    const addedLine = await callTool(client, "add_quote_line", {
      quoteId,
      productId: "01t000000000002AAA",
      quantity: 10,
      idempotencyKey: "t-4-line",
      confirmedByUser: true,
    });
    const quoteLineId = addedLine.data.quoteLineId;
    const parsed = await callTool(client, "apply_discount", {
      quoteId,
      quoteLineId,
      discountPercent: 20,
      confirmedByUser: false,
      idempotencyKey: "t-4-discount",
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("CONFIRMATION_REQUIRED");
  });

  it("rejects a 30% discount even when confirmedByUser is true", async () => {
    const { client } = await connectedClient();
    const created = await callTool(client, "create_renewal_quote", {
      accountId: ACME_UNIVERSITY_ID,
      termMonths: 36,
      effectiveDate: "2026-10-01",
      idempotencyKey: "t-5",
      confirmedByUser: true,
    });
    const quoteId = created.data.quoteId;
    const addedLine = await callTool(client, "add_quote_line", {
      quoteId,
      productId: "01t000000000002AAA",
      quantity: 10,
      idempotencyKey: "t-5-line",
      confirmedByUser: true,
    });
    const quoteLineId = addedLine.data.quoteLineId;
    const parsed = await callTool(client, "apply_discount", {
      quoteId,
      quoteLineId,
      discountPercent: 30,
      confirmedByUser: true,
      idempotencyKey: "t-5-discount",
    });
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("DISCOUNT_REJECTED");
  });

  it("returns the same quoteId when create_renewal_quote is called twice with the same idempotencyKey, and only invokes the gateway once", async () => {
    const { client, gateway } = await connectedClient();
    const spy = vi.spyOn(gateway, "createRenewalQuote");
    const args = {
      accountId: ACME_UNIVERSITY_ID,
      termMonths: 36,
      effectiveDate: "2026-10-01",
      idempotencyKey: "t-6",
      confirmedByUser: true,
    };
    const first = await callTool(client, "create_renewal_quote", args);
    const second = await callTool(client, "create_renewal_quote", args);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.data.quoteId).toBe(second.data.quoteId);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
