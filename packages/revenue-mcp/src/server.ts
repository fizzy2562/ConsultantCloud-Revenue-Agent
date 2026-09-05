import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerReadTools } from "./tools/index.js";
import { registerMutationTools } from "./tools/mutations.js";
import { RevenueGateway, MockRevenueGateway } from "@consultantcloud/shared";
import { EventLogger, FileEventSink } from "@consultantcloud/telemetry";

export function createServer(gateway: RevenueGateway): McpServer {
  const server = new McpServer({ name: "consultantcloud-revenue-mcp", version: "0.1.0" });
  const logger = new EventLogger(new FileEventSink("./revenue-mcp-events.jsonl"));
  registerReadTools(server, gateway, logger);
  registerMutationTools(server, gateway, logger);
  return server;
}

async function main() {
  const gateway = new MockRevenueGateway();
  const server = createServer(gateway);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
