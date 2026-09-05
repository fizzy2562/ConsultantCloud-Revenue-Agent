import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RevenueGateway, FindAccountInputSchema, AccountIdInputSchema, ProductSearchInputSchema, QuoteIdInputSchema, ToolResultSchema, FindAccountOutputSchema, AccountAssetsOutputSchema, ProductSearchOutputSchema, QuoteSummarySchema } from "@consultantcloud/shared";
import type { ToolCallEvent } from "@consultantcloud/shared";
import { z, type ZodTypeAny } from "zod";
import { logToolCallEvent } from "@consultantcloud/telemetry";

type ResultLike = { ok: boolean; error?: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" | "policy" | "mock" }; data?: unknown };
type EventLogger = { log(event: ToolCallEvent): void };

function validateResult(schema: ZodTypeAny, result: unknown): ResultLike {
  const validation = ToolResultSchema(schema).safeParse(result);
  if (validation.success) return validation.data as ResultLike;
  const candidate = result as { meta?: ResultLike["meta"] } | null;
  return { ok: false, error: { code: "INVALID_GATEWAY_RESPONSE", message: "Gateway returned a response that doesn't match the expected shape", retryable: false }, meta: candidate?.meta ?? { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" } };
}

function respond(logger: EventLogger, toolName: string, result: ResultLike) {
  const event: ToolCallEvent = { requestId: result.meta.requestId, runId: crypto.randomUUID(), toolName, durationMs: result.meta.durationMs, status: result.ok ? "success" : "error", timestamp: new Date().toISOString() };
  logToolCallEvent(logger, event);
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> };
}

export function registerFindAccount(server: McpServer, gateway: RevenueGateway, logger: EventLogger): void {
  server.registerTool("find_account", { title: "Find Account", description: "Looks up an account by name (case-insensitive partial match). Use this first, before any tool that takes an accountId, to resolve a customer's name to their account record. This tool is read-only and never modifies any data. No confirmation is required to call it. It never invents an account: if no fixture account matches, it returns an empty list rather than guessing or fabricating a plausible-looking account.", inputSchema: FindAccountInputSchema.shape }, async (args) => {
    try {
      return respond(logger, "find_account", validateResult(FindAccountOutputSchema, await gateway.findAccount(args)));
    } catch (err) {
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: crypto.randomUUID(), toolName: "find_account", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerGetAccountRevenueContext(server: McpServer, gateway: RevenueGateway, logger: EventLogger): void {
  server.registerTool("get_account_revenue_context", { title: "Get Account Revenue Context", description: "Returns an account's existing assets (quantities, product names, and status). It does not return discounts or contract terms. Use this after you have resolved an accountId via find_account. This tool is read-only and never modifies any data. No confirmation is required to call it. If the account has no recorded assets, it returns an empty list.", inputSchema: AccountIdInputSchema.shape }, async (args) => {
    try {
      // Resolving discounts or commercial terms by account ID requires a RevenueGateway method that is not yet defined.
      const assetsResult = await gateway.getAccountAssets(args);
      const rawResult = { ok: assetsResult.ok, data: assetsResult.ok ? { assets: assetsResult.data } : undefined, error: assetsResult.error, meta: assetsResult.meta };
      return respond(logger, "get_account_revenue_context", validateResult(z.object({ assets: AccountAssetsOutputSchema }), rawResult));
    } catch (err) {
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: crypto.randomUUID(), toolName: "get_account_revenue_context", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerSearchProducts(server: McpServer, gateway: RevenueGateway, logger: EventLogger): void {
  server.registerTool("search_products", { title: "Search Products", description: "Searches the product catalog by name or keyword (case-insensitive partial match). Use this to discover which products are available before building a quote or comparing options. This tool is read-only and never modifies any data. No confirmation is required to call it. It never invents a product: if no catalog entry matches, it returns an empty list rather than guessing or fabricating a plausible-looking product.", inputSchema: ProductSearchInputSchema.shape }, async (args) => {
    try {
      return respond(logger, "search_products", validateResult(ProductSearchOutputSchema, await gateway.searchProducts(args)));
    } catch (err) {
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: crypto.randomUUID(), toolName: "search_products", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerGetAccountAssets(server: McpServer, gateway: RevenueGateway, logger: EventLogger): void {
  server.registerTool("get_account_assets", { title: "Get Account Assets", description: "Returns the list of assets currently held by an account. Use this when you need the specific asset records for an account you have already resolved via find_account. This tool is read-only and never modifies any data. No confirmation is required to call it. It never invents an asset: if the account has no recorded assets, it returns an empty list rather than guessing or fabricating plausible-looking holdings.", inputSchema: AccountIdInputSchema.shape }, async (args) => {
    try {
      return respond(logger, "get_account_assets", validateResult(AccountAssetsOutputSchema, await gateway.getAccountAssets(args)));
    } catch (err) {
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: crypto.randomUUID(), toolName: "get_account_assets", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerGetQuoteSummary(server: McpServer, gateway: RevenueGateway, logger: EventLogger): void {
  server.registerTool("get_quote_summary", { title: "Get Quote Summary", description: "Returns a summary of an existing quote by its quote id. Use this to review the line items, totals, and status of a quote before presenting it to a customer. This tool is read-only and never modifies any data. No confirmation is required to call it. It never invents a quote: if no quote with the given id exists, it returns an error rather than guessing or fabricating a plausible-looking quote.", inputSchema: QuoteIdInputSchema.shape }, async (args) => {
    try {
      return respond(logger, "get_quote_summary", validateResult(QuoteSummarySchema, await gateway.getQuoteSummary(args)));
    } catch (err) {
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: crypto.randomUUID(), toolName: "get_quote_summary", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerReadTools(server: McpServer, gateway: RevenueGateway, logger: EventLogger): void {
  registerFindAccount(server, gateway, logger);
  registerGetAccountRevenueContext(server, gateway, logger);
  registerSearchProducts(server, gateway, logger);
  registerGetAccountAssets(server, gateway, logger);
  registerGetQuoteSummary(server, gateway, logger);
}
