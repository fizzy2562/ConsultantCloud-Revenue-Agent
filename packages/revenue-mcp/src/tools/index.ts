import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RevenueGateway, FindAccountInputSchema, AccountIdInputSchema, ProductSearchInputSchema, QuoteIdInputSchema, ToolResultSchema, FindAccountOutputSchema, AccountSummarySchema, AccountAssetsOutputSchema, ProductSearchOutputSchema, QuoteSummarySchema } from "@consultantcloud/shared";
import type { ToolCallEvent } from "@consultantcloud/shared";
import { z, type ZodTypeAny } from "zod";
import { logToolCallEvent } from "@consultantcloud/telemetry";
import { toolRegistration } from "../toolCatalog";

export { registerCatalogTools } from "./catalog";

type ResultLike = { ok: boolean; error?: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" | "policy" | "mock" }; data?: unknown };
type EventLogger = { log(event: ToolCallEvent): void };

function validateResult(schema: ZodTypeAny, result: unknown): ResultLike {
  const validation = ToolResultSchema(schema).safeParse(result);
  if (validation.success) return validation.data as ResultLike;
  const candidate = result as { meta?: ResultLike["meta"] } | null;
  return { ok: false, error: { code: "INVALID_GATEWAY_RESPONSE", message: "Gateway returned a response that doesn't match the expected shape", retryable: false }, meta: candidate?.meta ?? { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" } };
}

function respond(logger: EventLogger, toolName: string, result: ResultLike, runId?: string) {
  const event: ToolCallEvent = { requestId: result.meta.requestId, runId: runId ?? crypto.randomUUID(), toolName, durationMs: result.meta.durationMs, status: result.ok ? "success" : "error", timestamp: new Date().toISOString() };
  logToolCallEvent(logger, event);
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> };
}

export function registerFindAccount(server: McpServer, gateway: RevenueGateway, logger: EventLogger, runId?: string): void {
  server.registerTool("find_account", toolRegistration("find_account"), async (args) => {
    try {
      return respond(logger, "find_account", validateResult(FindAccountOutputSchema, await gateway.findAccount(args)), runId);
    } catch (err) {
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: runId ?? crypto.randomUUID(), toolName: "find_account", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerGetAccountRevenueContext(server: McpServer, gateway: RevenueGateway, logger: EventLogger, runId?: string): void {
  server.registerTool("get_account_revenue_context", toolRegistration("get_account_revenue_context"), async (args) => {
    try {
      const accountResult = await gateway.getAccountById!(args);
      if (!accountResult.ok) {
        return respond(logger, "get_account_revenue_context", validateResult(z.object({ account: AccountSummarySchema, assets: AccountAssetsOutputSchema }), accountResult), runId);
      }
      const assetsResult = await gateway.getAccountAssets(args);
      if (!assetsResult.ok) {
        return respond(logger, "get_account_revenue_context", validateResult(z.object({ account: AccountSummarySchema, assets: AccountAssetsOutputSchema }), assetsResult), runId);
      }
      const rawResult = { ok: true as const, data: { account: accountResult.data, assets: assetsResult.data }, meta: assetsResult.meta };
      return respond(logger, "get_account_revenue_context", validateResult(z.object({ account: AccountSummarySchema, assets: AccountAssetsOutputSchema }), rawResult), runId);
    } catch (err) {
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: runId ?? crypto.randomUUID(), toolName: "get_account_revenue_context", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerSearchProducts(server: McpServer, gateway: RevenueGateway, logger: EventLogger, runId?: string): void {
  server.registerTool("search_products", toolRegistration("search_products"), async (args) => {
    try {
      return respond(logger, "search_products", validateResult(ProductSearchOutputSchema, await gateway.searchProducts(args)), runId);
    } catch (err) {
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: runId ?? crypto.randomUUID(), toolName: "search_products", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerGetAccountAssets(server: McpServer, gateway: RevenueGateway, logger: EventLogger, runId?: string): void {
  server.registerTool("get_account_assets", toolRegistration("get_account_assets"), async (args) => {
    try {
      return respond(logger, "get_account_assets", validateResult(AccountAssetsOutputSchema, await gateway.getAccountAssets(args)), runId);
    } catch (err) {
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: runId ?? crypto.randomUUID(), toolName: "get_account_assets", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerGetQuoteSummary(server: McpServer, gateway: RevenueGateway, logger: EventLogger, runId?: string): void {
  server.registerTool("get_quote_summary", toolRegistration("get_quote_summary"), async (args) => {
    try {
      return respond(logger, "get_quote_summary", validateResult(QuoteSummarySchema, await gateway.getQuoteSummary(args)), runId);
    } catch (err) {
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: runId ?? crypto.randomUUID(), toolName: "get_quote_summary", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerReadTools(server: McpServer, gateway: RevenueGateway, logger: EventLogger, runId?: string): void {
  registerFindAccount(server, gateway, logger, runId);
  registerGetAccountRevenueContext(server, gateway, logger, runId);
  registerSearchProducts(server, gateway, logger, runId);
  registerGetAccountAssets(server, gateway, logger, runId);
  registerGetQuoteSummary(server, gateway, logger, runId);
}
