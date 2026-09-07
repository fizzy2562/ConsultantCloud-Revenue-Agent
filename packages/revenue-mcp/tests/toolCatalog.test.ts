import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MockRevenueGateway } from "@consultantcloud/shared";
import { createServer, toolCatalog } from "../src/server.js";

describe("tool catalog", () => {
  it("exactly matches the tools registered by the MCP server", async () => {
    const server = createServer(new MockRevenueGateway());
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "catalog-test", version: "0.1.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    try {
      const { tools } = await client.listTools();
      expect(toolCatalog.map((tool) => tool.name).sort()).toEqual(tools.map((tool) => tool.name).sort());
      expect(toolCatalog.every((tool) => tool.inputSchema.type === "object")).toBe(true);
    } finally {
      await client.close();
    }
  });
});
