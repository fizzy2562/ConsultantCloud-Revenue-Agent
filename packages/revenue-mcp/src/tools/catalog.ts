import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RevenueGateway, ToolResultSchema, CreateProductInputSchema, UpdateProductInputSchema, ProductResultSchema, SetProductPriceInputSchema, ProductPriceResultSchema, BundleIdInputSchema, BundleStructureSchema, AddBundleComponentInputSchema, BundleComponentResultSchema, RemoveBundleComponentInputSchema, RemoveBundleComponentResultSchema, UpdateBundleComponentInputSchema } from "@consultantcloud/shared";
import type { ToolCallEvent } from "@consultantcloud/shared";
import { IdempotencyStore, IdempotencyConflictError, requireConfirmation, withIdempotency } from "@consultantcloud/policy";
import { logToolCallEvent } from "@consultantcloud/telemetry";
import type { ZodTypeAny } from "zod";

type Logger = { log(event: ToolCallEvent): void };
type ResultLike = { ok: boolean; data?: unknown; error?: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" | "policy" | "mock" } };
const policyError = (code: string, message: string): ResultLike => ({ ok: false, error: { code, message, retryable: false }, meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" } });
function validate(schema: ZodTypeAny, result: unknown): ResultLike { const parsed = ToolResultSchema(schema).safeParse(result); return parsed.success ? parsed.data as ResultLike : policyError("INVALID_GATEWAY_RESPONSE", "Gateway returned a response that doesn't match the expected shape"); }
function respond(logger: Logger, name: string, result: ResultLike, runId?: string) { logToolCallEvent(logger, { requestId: result.meta.requestId, runId: runId ?? crypto.randomUUID(), toolName: name, durationMs: result.meta.durationMs, status: result.ok ? "success" : result.error?.code === "CONFIRMATION_REQUIRED" ? "policy_blocked" : "error", timestamp: new Date().toISOString() }); return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result as Record<string, unknown> }; }

export function registerCatalogTools(server: McpServer, gateway: RevenueGateway, logger: Logger, runId?: string): void {
  const registerWrite = (name: "create_product" | "update_product" | "set_product_price" | "add_bundle_component" | "remove_bundle_component" | "update_bundle_component", title: string, schema: any, output: ZodTypeAny, call: (args: any) => Promise<unknown>) => {
    const store = new IdempotencyStore<unknown>();
    server.registerTool(name, { title, description: `${title} in the Salesforce product catalog. This is a write operation and requires explicit user confirmation. Reusing an idempotency key with identical input returns the original result.`, inputSchema: schema.shape }, async (args: any) => {
      let raw: unknown;
      try {
        const confirmation = requireConfirmation(name, { confirmedByUser: args.confirmedByUser });
        raw = confirmation.satisfied ? await withIdempotency(store, args.idempotencyKey, JSON.stringify(args), () => call(args), (r) => (r as ResultLike).ok) : policyError("CONFIRMATION_REQUIRED", confirmation.reason ?? "Confirmation required");
      } catch (err) { raw = err instanceof IdempotencyConflictError ? policyError("IDEMPOTENCY_KEY_REUSED", err.message) : (() => { throw err; })(); }
      return respond(logger, name, validate(output, raw), runId);
    });
  };
  server.registerTool("get_bundle_structure", { title: "Get Bundle Structure", description: "Returns the real component records for a bundle product. Read-only.", inputSchema: BundleIdInputSchema.shape }, async (args: any) => respond(logger, "get_bundle_structure", validate(BundleStructureSchema, await gateway.getBundleStructure!(args)), runId));
  registerWrite("create_product", "Create Product", CreateProductInputSchema, ProductResultSchema, (a) => gateway.createProduct!(a));
  registerWrite("update_product", "Update Product", UpdateProductInputSchema, ProductResultSchema, (a) => gateway.updateProduct!(a));
  registerWrite("set_product_price", "Set Product Price", SetProductPriceInputSchema, ProductPriceResultSchema, (a) => gateway.setProductPrice!(a));
  registerWrite("add_bundle_component", "Add Bundle Component", AddBundleComponentInputSchema, BundleComponentResultSchema, (a) => gateway.addBundleComponent!(a));
  registerWrite("remove_bundle_component", "Remove Bundle Component", RemoveBundleComponentInputSchema, RemoveBundleComponentResultSchema, (a) => gateway.removeBundleComponent!(a));
  registerWrite("update_bundle_component", "Update Bundle Component", UpdateBundleComponentInputSchema, BundleComponentResultSchema, (a) => gateway.updateBundleComponent!(a));
}
