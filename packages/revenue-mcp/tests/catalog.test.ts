import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../src/server.js";
import { MockRevenueGateway } from "@consultantcloud/shared";

async function setup() { const gateway = new MockRevenueGateway(); const server = createServer(gateway); const [ct, st] = InMemoryTransport.createLinkedPair(); const client = new Client({ name: "catalog-test", version: "1" }); await Promise.all([client.connect(ct), server.connect(st)]); return { client, gateway }; }
async function call(client: Client, name: string, args: Record<string, unknown>) { const result: any = await client.callTool({ name, arguments: args }, CallToolResultSchema); return JSON.parse(result.content[0].text); }

describe("catalog tools", () => {
  it("requires confirmation before a product write", async () => { const { client, gateway } = await setup(); const spy = vi.spyOn(gateway, "createProduct"); const result = await call(client, "create_product", { name: "Router", confirmedByUser: false, idempotencyKey: "p1" }); expect(result.error.code).toBe("CONFIRMATION_REQUIRED"); expect(spy).not.toHaveBeenCalled(); });
  it("is idempotent and rejects key reuse with different input", async () => { const { client, gateway } = await setup(); const spy = vi.spyOn(gateway, "createProduct"); const args = { name: "Router", confirmedByUser: true, idempotencyKey: "p2" }; const first = await call(client, "create_product", args); const second = await call(client, "create_product", args); const conflict = await call(client, "create_product", { ...args, name: "Switch" }); expect(first.data.productId).toBe(second.data.productId); expect(spy).toHaveBeenCalledOnce(); expect(conflict.error.code).toBe("IDEMPOTENCY_KEY_REUSED"); });
  it("validates required Salesforce fields", async () => { const { client } = await setup(); const result: any = await client.callTool({ name: "create_product", arguments: { confirmedByUser: true, idempotencyKey: "p3" } }, CallToolResultSchema); expect(result.isError).toBe(true); });
  it("creates, prices, and links products in the mock catalog", async () => { const { client } = await setup(); const parent = await call(client, "create_product", { name: "Demo Bundle", type: "Bundle", confirmedByUser: true, idempotencyKey: "p4" }); const child = await call(client, "create_product", { name: "Monitor", confirmedByUser: true, idempotencyKey: "p5" }); const price = await call(client, "set_product_price", { productId: child.data.productId, unitPrice: 299, confirmedByUser: true, idempotencyKey: "p6" }); await call(client, "add_bundle_component", { parentProductId: parent.data.productId, childProductId: child.data.productId, quantity: 1, confirmedByUser: true, idempotencyKey: "p7" }); const structure = await call(client, "get_bundle_structure", { productId: parent.data.productId }); expect(price.data.unitPrice).toBe(299); expect(structure.data.components[0].childName).toBe("Monitor"); });
});
