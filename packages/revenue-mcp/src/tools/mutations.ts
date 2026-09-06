import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RevenueGateway, CreateInitialQuoteInputSchema, CreateRenewalQuoteInputSchema, AddQuoteLineInputSchema, RemoveQuoteLineInputSchema, UpdateQuoteLineInputSchema, ApplyDiscountInputSchema, ToolResultSchema, QuoteResultSchema, QuoteLineResultSchema, RemoveQuoteLineResultSchema, UpdateQuoteLineResultSchema, DiscountResultSchema } from "@consultantcloud/shared";
import type { ToolCallEvent } from "@consultantcloud/shared";
import type { ZodTypeAny } from "zod";
import { evaluateDiscount, requireConfirmation, IdempotencyStore, withIdempotency, IdempotencyConflictError } from "@consultantcloud/policy";
import { logToolCallEvent } from "@consultantcloud/telemetry";

type ResultLike = { ok: boolean; error?: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" | "policy" | "mock" }; data?: unknown };
type EventLogger = { log(event: ToolCallEvent): void };

function validateResult(schema: ZodTypeAny, result: unknown): ResultLike {
  const validation = ToolResultSchema(schema).safeParse(result);
  if (validation.success) return validation.data as ResultLike;
  const candidate = result as { meta?: ResultLike["meta"] } | null;
  return { ok: false, error: { code: "INVALID_GATEWAY_RESPONSE", message: "Gateway returned a response that doesn't match the expected shape", retryable: false }, meta: candidate?.meta ?? { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" } };
}

function respond(logger: EventLogger, toolName: string, result: ResultLike, details: Partial<ToolCallEvent> = {}, runId?: string) {
  logToolCallEvent(logger, { requestId: result.meta.requestId, runId: runId ?? crypto.randomUUID(), toolName, durationMs: result.meta.durationMs, status: result.ok ? "success" : result.error?.code === "CONFIRMATION_REQUIRED" || result.error?.code === "APPROVER_REQUIRED" || result.error?.code === "DISCOUNT_REJECTED" ? "policy_blocked" : "error", timestamp: new Date().toISOString(), ...details });
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> };
}

function idempotencyConflictResult(err: IdempotencyConflictError) {
  return { ok: false as const, error: { code: "IDEMPOTENCY_KEY_REUSED", message: err.message, retryable: false }, meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" as const } };
}

export function registerCreateInitialQuote(server: McpServer, gateway: RevenueGateway, logger: EventLogger, store: IdempotencyStore<unknown>, runId?: string): void {
  server.registerTool("create_initial_quote", { title: "Create Initial Quote", description: "Creates a new quote for an account with no existing quote. This mutates Salesforce (or the mock) state: it creates a real quote record. It requires confirmedByUser: true — if the caller has not obtained explicit user confirmation, this tool returns an error rather than creating anything. Repeated calls with the same idempotencyKey are safe and will not create duplicate quotes; the first result is returned again unchanged.", inputSchema: CreateInitialQuoteInputSchema.shape }, async (args) => {
    try {
      const confirmation = requireConfirmation("create_initial_quote", { confirmedByUser: args.confirmedByUser });
      const rawResult = !confirmation.satisfied ? { ok: false, error: { code: "CONFIRMATION_REQUIRED", message: confirmation.reason ?? "Confirmation required", retryable: false }, meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" as const } } : await withIdempotency(store, args.idempotencyKey, JSON.stringify(args), () => gateway.createInitialQuote(args), (result) => (result as { ok: boolean }).ok === true);
      return respond(logger, "create_initial_quote", validateResult(QuoteResultSchema, rawResult), { confirmationEvent: args.confirmedByUser ? "confirmed" : "declined" }, runId);
    } catch (err) {
      if (err instanceof IdempotencyConflictError) {
        return respond(logger, "create_initial_quote", validateResult(QuoteResultSchema, idempotencyConflictResult(err)), { confirmationEvent: args.confirmedByUser ? "confirmed" : "declined" }, runId);
      }
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: runId ?? crypto.randomUUID(), toolName: "create_initial_quote", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerCreateRenewalQuote(server: McpServer, gateway: RevenueGateway, logger: EventLogger, store: IdempotencyStore<unknown>, runId?: string): void {
  server.registerTool("create_renewal_quote", { title: "Create Renewal Quote", description: "Creates a renewal quote for an account that already has an existing quote. This mutates Salesforce (or the mock) state: it creates a real quote record. It requires confirmedByUser: true — if the caller has not obtained explicit user confirmation, this tool returns an error rather than creating anything. Repeated calls with the same idempotencyKey are safe and will not create duplicate quotes; the first result is returned again unchanged.", inputSchema: CreateRenewalQuoteInputSchema.shape }, async (args) => {
    try {
      const confirmation = requireConfirmation("create_renewal_quote", { confirmedByUser: args.confirmedByUser });
      const rawResult = !confirmation.satisfied ? { ok: false, error: { code: "CONFIRMATION_REQUIRED", message: confirmation.reason ?? "Confirmation required", retryable: false }, meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" as const } } : await withIdempotency(store, args.idempotencyKey, JSON.stringify(args), () => gateway.createRenewalQuote(args), (result) => (result as { ok: boolean }).ok === true);
      return respond(logger, "create_renewal_quote", validateResult(QuoteResultSchema, rawResult), { confirmationEvent: args.confirmedByUser ? "confirmed" : "declined" }, runId);
    } catch (err) {
      if (err instanceof IdempotencyConflictError) {
        return respond(logger, "create_renewal_quote", validateResult(QuoteResultSchema, idempotencyConflictResult(err)), { confirmationEvent: args.confirmedByUser ? "confirmed" : "declined" }, runId);
      }
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: runId ?? crypto.randomUUID(), toolName: "create_renewal_quote", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerAddQuoteLine(server: McpServer, gateway: RevenueGateway, logger: EventLogger, store: IdempotencyStore<unknown>, runId?: string): void {
  server.registerTool("add_quote_line", { title: "Add Quote Line", description: "Adds a line item to an existing quote. This mutates Salesforce (or the mock) state: it creates a real quote line record on the target quote. Repeated calls with the same idempotencyKey are safe and will not create duplicate line items; the first result is returned again unchanged.", inputSchema: AddQuoteLineInputSchema.shape }, async (args) => {
    try {
      const rawResult = await withIdempotency(store, args.idempotencyKey, JSON.stringify(args), () => gateway.addQuoteLine(args), (result) => (result as { ok: boolean }).ok === true);
      return respond(logger, "add_quote_line", validateResult(QuoteLineResultSchema, rawResult), {}, runId);
    } catch (err) {
      if (err instanceof IdempotencyConflictError) {
        return respond(logger, "add_quote_line", validateResult(QuoteLineResultSchema, idempotencyConflictResult(err)), {}, runId);
      }
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: runId ?? crypto.randomUUID(), toolName: "add_quote_line", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerRemoveQuoteLine(server: McpServer, gateway: RevenueGateway, logger: EventLogger, store: IdempotencyStore<unknown>, runId?: string): void {
  server.registerTool("remove_quote_line", { title: "Remove Quote Line", description: "Removes a line item from an existing quote. This mutates Salesforce (or the mock) state by deleting the target quote line. It requires confirmedByUser: true. Repeated calls with the same idempotencyKey are safe and will not remove the line more than once; the first result is returned again unchanged.", inputSchema: RemoveQuoteLineInputSchema.shape }, async (args) => {
    try {
      const confirmation = requireConfirmation("remove_quote_line", { confirmedByUser: args.confirmedByUser });
      const rawResult = !confirmation.satisfied ? { ok: false, error: { code: "CONFIRMATION_REQUIRED", message: confirmation.reason ?? "Confirmation required", retryable: false }, meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" as const } } : await withIdempotency(store, args.idempotencyKey, JSON.stringify(args), () => gateway.removeQuoteLine(args), (result) => (result as { ok: boolean }).ok === true);
      return respond(logger, "remove_quote_line", validateResult(RemoveQuoteLineResultSchema, rawResult), { confirmationEvent: args.confirmedByUser ? "confirmed" : "declined" }, runId);
    } catch (err) {
      if (err instanceof IdempotencyConflictError) return respond(logger, "remove_quote_line", validateResult(RemoveQuoteLineResultSchema, idempotencyConflictResult(err)), { confirmationEvent: args.confirmedByUser ? "confirmed" : "declined" }, runId);
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: runId ?? crypto.randomUUID(), toolName: "remove_quote_line", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerUpdateQuoteLine(server: McpServer, gateway: RevenueGateway, logger: EventLogger, store: IdempotencyStore<unknown>, runId?: string): void {
  server.registerTool("update_quote_line", { title: "Update Quote Line", description: "Updates the quantity of an existing quote line. This mutates Salesforce (or the mock) state by changing the target line item's quantity. It requires confirmedByUser: true. Repeated calls with the same idempotencyKey are safe and will not apply the quantity change more than once; the first result is returned again unchanged.", inputSchema: UpdateQuoteLineInputSchema.shape }, async (args) => {
    try {
      const confirmation = requireConfirmation("update_quote_line", { confirmedByUser: args.confirmedByUser });
      const rawResult = !confirmation.satisfied ? { ok: false, error: { code: "CONFIRMATION_REQUIRED", message: confirmation.reason ?? "Confirmation required", retryable: false }, meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" as const } } : await withIdempotency(store, args.idempotencyKey, JSON.stringify(args), () => gateway.updateQuoteLine(args), (result) => (result as { ok: boolean }).ok === true);
      return respond(logger, "update_quote_line", validateResult(UpdateQuoteLineResultSchema, rawResult), { confirmationEvent: args.confirmedByUser ? "confirmed" : "declined" }, runId);
    } catch (err) {
      if (err instanceof IdempotencyConflictError) return respond(logger, "update_quote_line", validateResult(UpdateQuoteLineResultSchema, idempotencyConflictResult(err)), { confirmationEvent: args.confirmedByUser ? "confirmed" : "declined" }, runId);
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: runId ?? crypto.randomUUID(), toolName: "update_quote_line", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerApplyDiscount(server: McpServer, gateway: RevenueGateway, logger: EventLogger, store: IdempotencyStore<unknown>, runId?: string): void {
  server.registerTool("apply_discount", { title: "Apply Discount", description: "Applies a discount to an existing quote. This mutates Salesforce (or the mock) state: it updates the quote's discount. Policy bands: 0-15% is permitted without additional approval; 15.01-25% requires manager approval (confirmedByUser: true must be set); above 25% is rejected outright regardless of confirmation. Repeated calls with the same idempotencyKey are safe and will not apply the discount twice; the first result is returned again unchanged.", inputSchema: ApplyDiscountInputSchema.shape }, async (args) => {
    try {
      const evaluation = evaluateDiscount(args.discountPercent);
      let rawResult: unknown;
      let confirmationEvent: "confirmed" | "declined" | undefined;
      if (evaluation.decision === "rejected") {
        rawResult = { ok: false, error: { code: "DISCOUNT_REJECTED", message: evaluation.reason ?? "Discount rejected by policy", retryable: false }, meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" } };
      } else {
        const confirmation = requireConfirmation("apply_discount", { discountDecision: evaluation.decision, confirmedByUser: args.confirmedByUser });
        if (evaluation.decision === "approval_required") confirmationEvent = args.confirmedByUser ? "confirmed" : "declined";
        rawResult = !confirmation.satisfied
          ? { ok: false, error: { code: "CONFIRMATION_REQUIRED", message: confirmation.reason ?? "Confirmation required", retryable: false }, meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" } }
          : evaluation.decision === "approval_required" && !args.approvedBy?.trim()
            ? { ok: false, error: { code: "APPROVER_REQUIRED", message: "A manager's name is required to approve a discount above 15%.", retryable: false }, meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" } }
            : await withIdempotency(store, args.idempotencyKey, JSON.stringify(args), () => gateway.applyDiscount(args), (result) => (result as { ok: boolean }).ok === true);
      }
      return respond(logger, "apply_discount", validateResult(DiscountResultSchema, rawResult), { policyDecision: evaluation.decision, ...(confirmationEvent ? { confirmationEvent } : {}) }, runId);
    } catch (err) {
      if (err instanceof IdempotencyConflictError) {
        const evaluation = evaluateDiscount(args.discountPercent);
        const confirmationEvent = evaluation.decision === "approval_required" ? args.confirmedByUser ? "confirmed" as const : "declined" as const : undefined;
        return respond(logger, "apply_discount", validateResult(DiscountResultSchema, idempotencyConflictResult(err)), { policyDecision: evaluation.decision, ...(confirmationEvent ? { confirmationEvent } : {}) }, runId);
      }
      logToolCallEvent(logger, { requestId: crypto.randomUUID(), runId: runId ?? crypto.randomUUID(), toolName: "apply_discount", durationMs: 0, status: "error", timestamp: new Date().toISOString() });
      throw err;
    }
  });
}

export function registerMutationTools(server: McpServer, gateway: RevenueGateway, logger: EventLogger, runId?: string): void {
  const initialQuoteStore = new IdempotencyStore<unknown>();
  const renewalQuoteStore = new IdempotencyStore<unknown>();
  const addLineStore = new IdempotencyStore<unknown>();
  const removeLineStore = new IdempotencyStore<unknown>();
  const updateLineStore = new IdempotencyStore<unknown>();
  const applyDiscountStore = new IdempotencyStore<unknown>();
  registerCreateInitialQuote(server, gateway, logger, initialQuoteStore, runId);
  registerCreateRenewalQuote(server, gateway, logger, renewalQuoteStore, runId);
  registerAddQuoteLine(server, gateway, logger, addLineStore, runId);
  registerRemoveQuoteLine(server, gateway, logger, removeLineStore, runId);
  registerUpdateQuoteLine(server, gateway, logger, updateLineStore, runId);
  registerApplyDiscount(server, gateway, logger, applyDiscountStore, runId);
}
