import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RevenueGateway, CreateInitialQuoteInputSchema, CreateRenewalQuoteInputSchema, AddQuoteLineInputSchema, ApplyDiscountInputSchema, ToolResultSchema, QuoteResultSchema, QuoteLineResultSchema, DiscountResultSchema } from "@consultantcloud/shared";
import type { ToolCallEvent } from "@consultantcloud/shared";
import type { ZodTypeAny } from "zod";
import { evaluateDiscount, requireConfirmation, IdempotencyStore, withIdempotency } from "@consultantcloud/policy";
import { logToolCallEvent } from "@consultantcloud/telemetry";

type ResultLike = { ok: boolean; error?: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" | "policy" | "mock" }; data?: unknown };
type EventLogger = { log(event: ToolCallEvent): void };

function validateResult(schema: ZodTypeAny, result: unknown): ResultLike {
  const validation = ToolResultSchema(schema).safeParse(result);
  if (validation.success) return validation.data as ResultLike;
  const candidate = result as { meta?: ResultLike["meta"] } | null;
  return { ok: false, error: { code: "INVALID_GATEWAY_RESPONSE", message: "Gateway returned a response that doesn't match the expected shape", retryable: false }, meta: candidate?.meta ?? { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" } };
}

function respond(logger: EventLogger, toolName: string, result: ResultLike, details: Partial<ToolCallEvent> = {}) {
  logToolCallEvent(logger, { requestId: result.meta.requestId, runId: crypto.randomUUID(), toolName, durationMs: result.meta.durationMs, status: result.ok ? "success" : result.error?.code === "CONFIRMATION_REQUIRED" || result.error?.code === "DISCOUNT_REJECTED" ? "policy_blocked" : "error", timestamp: new Date().toISOString(), ...details });
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> };
}

export function registerCreateInitialQuote(server: McpServer, gateway: RevenueGateway, logger: EventLogger, store: IdempotencyStore<unknown>): void {
  server.registerTool("create_initial_quote", { title: "Create Initial Quote", description: "Creates a new quote for an account with no existing quote. This mutates Salesforce (or the mock) state: it creates a real quote record. It requires confirmedByUser: true — if the caller has not obtained explicit user confirmation, this tool returns an error rather than creating anything. Repeated calls with the same idempotencyKey are safe and will not create duplicate quotes; the first result is returned again unchanged.", inputSchema: CreateInitialQuoteInputSchema.shape }, async (args) => {
    const confirmation = requireConfirmation("create_initial_quote", { confirmedByUser: args.confirmedByUser });
    const rawResult = !confirmation.satisfied ? { ok: false, error: { code: "CONFIRMATION_REQUIRED", message: confirmation.reason ?? "Confirmation required", retryable: false }, meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" as const } } : await withIdempotency(store, args.idempotencyKey, () => gateway.createInitialQuote(args), (result) => (result as { ok: boolean }).ok === true);
    return respond(logger, "create_initial_quote", validateResult(QuoteResultSchema, rawResult), { confirmationEvent: args.confirmedByUser ? "confirmed" : "declined" });
  });
}

export function registerCreateRenewalQuote(server: McpServer, gateway: RevenueGateway, logger: EventLogger, store: IdempotencyStore<unknown>): void {
  server.registerTool("create_renewal_quote", { title: "Create Renewal Quote", description: "Creates a renewal quote for an account that already has an existing quote. This mutates Salesforce (or the mock) state: it creates a real quote record. It requires confirmedByUser: true — if the caller has not obtained explicit user confirmation, this tool returns an error rather than creating anything. Repeated calls with the same idempotencyKey are safe and will not create duplicate quotes; the first result is returned again unchanged.", inputSchema: CreateRenewalQuoteInputSchema.shape }, async (args) => {
    const confirmation = requireConfirmation("create_renewal_quote", { confirmedByUser: args.confirmedByUser });
    const rawResult = !confirmation.satisfied ? { ok: false, error: { code: "CONFIRMATION_REQUIRED", message: confirmation.reason ?? "Confirmation required", retryable: false }, meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" as const } } : await withIdempotency(store, args.idempotencyKey, () => gateway.createRenewalQuote(args), (result) => (result as { ok: boolean }).ok === true);
    return respond(logger, "create_renewal_quote", validateResult(QuoteResultSchema, rawResult), { confirmationEvent: args.confirmedByUser ? "confirmed" : "declined" });
  });
}

export function registerAddQuoteLine(server: McpServer, gateway: RevenueGateway, logger: EventLogger, store: IdempotencyStore<unknown>): void {
  server.registerTool("add_quote_line", { title: "Add Quote Line", description: "Adds a line item to an existing quote. This mutates Salesforce (or the mock) state: it creates a real quote line record on the target quote. Repeated calls with the same idempotencyKey are safe and will not create duplicate line items; the first result is returned again unchanged.", inputSchema: AddQuoteLineInputSchema.shape }, async (args) => {
    const rawResult = await withIdempotency(store, args.idempotencyKey, () => gateway.addQuoteLine(args), (result) => (result as { ok: boolean }).ok === true);
    return respond(logger, "add_quote_line", validateResult(QuoteLineResultSchema, rawResult));
  });
}

export function registerApplyDiscount(server: McpServer, gateway: RevenueGateway, logger: EventLogger, store: IdempotencyStore<unknown>): void {
  server.registerTool("apply_discount", { title: "Apply Discount", description: "Applies a discount to an existing quote. This mutates Salesforce (or the mock) state: it updates the quote's discount. Policy bands: 0-15% is permitted without additional approval; 15.01-25% requires manager approval (confirmedByUser: true must be set); above 25% is rejected outright regardless of confirmation. Repeated calls with the same idempotencyKey are safe and will not apply the discount twice; the first result is returned again unchanged.", inputSchema: ApplyDiscountInputSchema.shape }, async (args) => {
    const evaluation = evaluateDiscount(args.discountPercent);
    let rawResult: unknown;
    let confirmationEvent: "confirmed" | "declined" | undefined;
    if (evaluation.decision === "rejected") {
      rawResult = { ok: false, error: { code: "DISCOUNT_REJECTED", message: evaluation.reason ?? "Discount rejected by policy", retryable: false }, meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" } };
    } else {
      const confirmation = requireConfirmation("apply_discount", { discountDecision: evaluation.decision, confirmedByUser: args.confirmedByUser });
      if (evaluation.decision === "approval_required") confirmationEvent = args.confirmedByUser ? "confirmed" : "declined";
      rawResult = !confirmation.satisfied ? { ok: false, error: { code: "CONFIRMATION_REQUIRED", message: confirmation.reason ?? "Confirmation required", retryable: false }, meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" } } : await withIdempotency(store, args.idempotencyKey, () => gateway.applyDiscount(args), (result) => (result as { ok: boolean }).ok === true);
    }
    return respond(logger, "apply_discount", validateResult(DiscountResultSchema, rawResult), { policyDecision: evaluation.decision, ...(confirmationEvent ? { confirmationEvent } : {}) });
  });
}

export function registerMutationTools(server: McpServer, gateway: RevenueGateway, logger: EventLogger): void {
  const initialQuoteStore = new IdempotencyStore<unknown>();
  const renewalQuoteStore = new IdempotencyStore<unknown>();
  const addLineStore = new IdempotencyStore<unknown>();
  const applyDiscountStore = new IdempotencyStore<unknown>();
  registerCreateInitialQuote(server, gateway, logger, initialQuoteStore);
  registerCreateRenewalQuote(server, gateway, logger, renewalQuoteStore);
  registerAddQuoteLine(server, gateway, logger, addLineStore);
  registerApplyDiscount(server, gateway, logger, applyDiscountStore);
}
