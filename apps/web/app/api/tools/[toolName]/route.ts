import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer, createRevenueGateway } from "@consultantcloud/revenue-mcp";
import {
  AccountIdInputSchema,
  AddQuoteLineInputSchema,
  ApplyDiscountInputSchema,
  CreateInitialQuoteInputSchema,
  CreateRenewalQuoteInputSchema,
  FindAccountInputSchema,
  ProductSearchInputSchema,
  QuoteIdInputSchema,
  RemoveQuoteLineInputSchema,
  UpdateQuoteLineInputSchema,
} from "@consultantcloud/shared";
import { authorizeToolsRequest } from "../../../../lib/toolsBridgeAuth";

export const runtime = "nodejs";

const gateway = createRevenueGateway();

const toolSchemas = {
  find_account: FindAccountInputSchema,
  get_account_revenue_context: AccountIdInputSchema,
  search_products: ProductSearchInputSchema,
  get_account_assets: AccountIdInputSchema,
  get_quote_summary: QuoteIdInputSchema,
  create_initial_quote: CreateInitialQuoteInputSchema,
  create_renewal_quote: CreateRenewalQuoteInputSchema,
  add_quote_line: AddQuoteLineInputSchema,
  remove_quote_line: RemoveQuoteLineInputSchema,
  update_quote_line: UpdateQuoteLineInputSchema,
  apply_discount: ApplyDiscountInputSchema,
};

type ToolName = keyof typeof toolSchemas;

function isToolName(value: string): value is ToolName {
  return Object.prototype.hasOwnProperty.call(toolSchemas, value);
}

function parseToolResult(result: unknown): unknown {
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content;
  const first = content?.[0];
  if (first?.type !== "text" || typeof first.text !== "string") {
    throw new Error("Revenue MCP tool returned no JSON text content");
  }
  return JSON.parse(first.text);
}

async function callTool(name: ToolName, args: Record<string, unknown>) {
  const server = createServer(gateway);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "tools-rest-bridge", version: "0.1.0" });

  try {
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    const result = await client.callTool({ name, arguments: args }, CallToolResultSchema);
    return parseToolResult(result);
  } finally {
    await client.close();
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ toolName: string }> }
) {
  const authFailure = authorizeToolsRequest(request);
  if (authFailure) return authFailure;

  const { toolName } = await context.params;
  if (!isToolName(toolName)) {
    return Response.json({ error: "Unknown tool" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const validation = toolSchemas[toolName].safeParse(body);
  if (!validation.success) {
    return Response.json(
      { error: "Invalid request body", details: validation.error.flatten() },
      { status: 400 }
    );
  }

  try {
    return Response.json(await callTool(toolName, validation.data));
  } catch (error) {
    console.error(`Tools API ${toolName} failed:`, error);
    return Response.json(
      { error: "The tool is temporarily unavailable. Please try again." },
      { status: 500 }
    );
  }
}
