import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  RevenueGateway,
  FindAccountInputSchema,
  AccountIdInputSchema,
  ProductSearchInputSchema,
  QuoteIdInputSchema,
} from "@consultantcloud/shared";

export function registerFindAccount(server: McpServer, gateway: RevenueGateway): void {
  server.registerTool(
    "find_account",
    {
      title: "Find Account",
      description:
        "Looks up an account by name (case-insensitive partial match). Use this first, before any tool that takes an accountId, to resolve a customer's name to their account record. This tool is read-only and never modifies any data. No confirmation is required to call it. It never invents an account: if no fixture account matches, it returns an empty list rather than guessing or fabricating a plausible-looking account.",
      inputSchema: FindAccountInputSchema.shape,
    },
    async (args) => {
      const result = await gateway.findAccount(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }
  );
}

export function registerGetAccountRevenueContext(server: McpServer, gateway: RevenueGateway): void {
  server.registerTool(
    "get_account_revenue_context",
    {
      title: "Get Account Revenue Context",
      description:
        "Returns an account's existing assets and commercial context in a single call, so you can avoid multiple round trips when you need the full picture of what an account already holds. Use this after you have resolved an accountId via find_account. This tool is read-only and never modifies any data. No confirmation is required to call it. It never invents assets or commercial terms: if the account has no recorded assets, it returns an empty list rather than guessing or fabricating plausible-looking holdings.",
      inputSchema: AccountIdInputSchema.shape,
    },
    async (args) => {
      const assetsResult = await gateway.getAccountAssets(args);
      const result = {
        ok: assetsResult.ok,
        data: assetsResult.ok ? { assets: assetsResult.data } : undefined,
        error: assetsResult.error,
        meta: assetsResult.meta,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }
  );
}

export function registerSearchProducts(server: McpServer, gateway: RevenueGateway): void {
  server.registerTool(
    "search_products",
    {
      title: "Search Products",
      description:
        "Searches the product catalog by name or keyword (case-insensitive partial match). Use this to discover which products are available before building a quote or comparing options. This tool is read-only and never modifies any data. No confirmation is required to call it. It never invents a product: if no catalog entry matches, it returns an empty list rather than guessing or fabricating a plausible-looking product.",
      inputSchema: ProductSearchInputSchema.shape,
    },
    async (args) => {
      const result = await gateway.searchProducts(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }
  );
}

export function registerGetAccountAssets(server: McpServer, gateway: RevenueGateway): void {
  server.registerTool(
    "get_account_assets",
    {
      title: "Get Account Assets",
      description:
        "Returns the list of assets currently held by an account. Use this when you need the specific asset records for an account you have already resolved via find_account. This tool is read-only and never modifies any data. No confirmation is required to call it. It never invents an asset: if the account has no recorded assets, it returns an empty list rather than guessing or fabricating plausible-looking holdings.",
      inputSchema: AccountIdInputSchema.shape,
    },
    async (args) => {
      const result = await gateway.getAccountAssets(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }
  );
}

export function registerGetQuoteSummary(server: McpServer, gateway: RevenueGateway): void {
  server.registerTool(
    "get_quote_summary",
    {
      title: "Get Quote Summary",
      description:
        "Returns a summary of an existing quote by its quote id. Use this to review the line items, totals, and status of a quote before presenting it to a customer. This tool is read-only and never modifies any data. No confirmation is required to call it. It never invents a quote: if no quote with the given id exists, it returns an error rather than guessing or fabricating a plausible-looking quote.",
      inputSchema: QuoteIdInputSchema.shape,
    },
    async (args) => {
      const result = await gateway.getQuoteSummary(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    }
  );
}

export function registerReadTools(server: McpServer, gateway: RevenueGateway): void {
  registerFindAccount(server, gateway);
  registerGetAccountRevenueContext(server, gateway);
  registerSearchProducts(server, gateway);
  registerGetAccountAssets(server, gateway);
  registerGetQuoteSummary(server, gateway);
}
