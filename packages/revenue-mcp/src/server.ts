import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerReadTools } from "./tools/index";
import { registerMutationTools } from "./tools/mutations";
import { registerCatalogTools } from "./tools/catalog";
import { RevenueGateway, MockRevenueGateway } from "@consultantcloud/shared";
import { EventLogger, FileEventSink } from "@consultantcloud/telemetry";
import { createSalesforceConnection } from "./salesforce/auth";
import { SalesforceRevenueGateway } from "./salesforce/salesforceGateway";

export { catalogToolNames, catalogTools, toolCatalog, toolDefinitions } from "./toolCatalog";
export type { ToolName } from "./toolCatalog";
export { SALESFORCE_CAPABILITIES } from "./salesforce/salesforceGateway";

export function createRevenueGateway(): RevenueGateway {
  if (process.env.SF_INSTANCE_URL && process.env.SF_ACCESS_TOKEN) {
    return new SalesforceRevenueGateway(createSalesforceConnection());
  }
  return new MockRevenueGateway();
}

export function createServer(gateway: RevenueGateway, options?: { runId?: string }): McpServer {
  const server = new McpServer({ name: "consultantcloud-revenue-mcp", version: "0.1.0" });
  const logger = new EventLogger(new FileEventSink("./revenue-mcp-events.jsonl"));
  registerReadTools(server, gateway, logger, options?.runId);
  registerMutationTools(server, gateway, logger, options?.runId);
  registerCatalogTools(server, gateway, logger, options?.runId);
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
