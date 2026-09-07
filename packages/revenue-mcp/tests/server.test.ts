import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../src/server.js";
import { MockRevenueGateway } from "@consultantcloud/shared";

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
  return client;
}

describe("Revenue MCP server", () => {
  it("lists all read and mutation tools", async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "find_account",
        "get_account_assets",
        "get_account_revenue_context",
        "get_quote_summary",
        "search_products",
        "create_initial_quote",
        "create_renewal_quote",
        "create_amendment_quote",
        "add_quote_line",
        "remove_quote_line",
        "update_quote_line",
        "apply_discount",
        "create_product", "update_product", "set_product_price", "get_bundle_structure",
        "add_bundle_component", "remove_bundle_component", "update_bundle_component",
      ].sort()
    );
  });

  it("find_account returns Acme University for a partial name match", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "find_account", arguments: { name: "Acme" } }, CallToolResultSchema) as TextToolResult;
    const first = result.content[0];
    if (!first || first.type !== "text") throw new Error("expected text content");
    const parsed = JSON.parse(first.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.length).toBe(1);
    expect(parsed.data[0].name).toBe("Acme University");
  });

  it("find_account returns an empty result for an unknown name, not an error", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "find_account", arguments: { name: "Totally Unknown Corp" } }, CallToolResultSchema) as TextToolResult;
    const first = result.content[0];
    if (!first || first.type !== "text") throw new Error("expected text content");
    const parsed = JSON.parse(first.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.length).toBe(0);
  });

  it("search_products returns all three fixture products for an empty query", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "search_products", arguments: { query: "" } }, CallToolResultSchema) as TextToolResult;
    const first = result.content[0];
    if (!first || first.type !== "text") throw new Error("expected text content");
    const parsed = JSON.parse(first.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.length).toBe(3);
  });

  it("get_account_revenue_context returns the account and its assets", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "get_account_revenue_context", arguments: { accountId: "001000000000001AAA" } }, CallToolResultSchema) as TextToolResult;
    const first = result.content[0];
    if (!first || first.type !== "text") throw new Error("expected text content");
    const parsed = JSON.parse(first.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.data.account.name).toBe("Acme University");
    expect(parsed.data.account.existingDiscountPercent).toBe(12);
    expect(parsed.data.assets.length).toBeGreaterThan(0);
  });
});
