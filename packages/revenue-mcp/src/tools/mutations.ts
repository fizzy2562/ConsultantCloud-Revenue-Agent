import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  RevenueGateway,
  CreateInitialQuoteInputSchema,
  CreateRenewalQuoteInputSchema,
  AddQuoteLineInputSchema,
  ApplyDiscountInputSchema,
} from "@consultantcloud/shared";
import {
  evaluateDiscount,
  requireConfirmation,
  IdempotencyStore,
  withIdempotency,
} from "@consultantcloud/policy";

const initialQuoteStore = new IdempotencyStore<unknown>();
const renewalQuoteStore = new IdempotencyStore<unknown>();
const addLineStore = new IdempotencyStore<unknown>();
const applyDiscountStore = new IdempotencyStore<unknown>();

export function registerCreateInitialQuote(server: McpServer, gateway: RevenueGateway): void {
  server.registerTool(
    "create_initial_quote",
    {
      title: "Create Initial Quote",
      description:
        "Creates a new quote for an account with no existing quote. This mutates Salesforce (or the mock) state: it creates a real quote record. It requires confirmedByUser: true — if the caller has not obtained explicit user confirmation, this tool returns an error rather than creating anything. Repeated calls with the same idempotencyKey are safe and will not create duplicate quotes; the first result is returned again unchanged.",
      inputSchema: CreateInitialQuoteInputSchema.shape,
    },
    async (args) => {
      const confirmation = requireConfirmation("create_initial_quote", {
        confirmedByUser: args.confirmedByUser,
      });
      if (!confirmation.satisfied) {
        const result = {
          ok: false,
          error: { code: "CONFIRMATION_REQUIRED", message: confirmation.reason ?? "Confirmation required", retryable: false },
          meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" },
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> };
      }
      const result = await withIdempotency(initialQuoteStore, args.idempotencyKey, () =>
        gateway.createInitialQuote(args)
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> };
    }
  );
}

export function registerCreateRenewalQuote(server: McpServer, gateway: RevenueGateway): void {
  server.registerTool(
    "create_renewal_quote",
    {
      title: "Create Renewal Quote",
      description:
        "Creates a renewal quote for an account that already has an existing quote. This mutates Salesforce (or the mock) state: it creates a real quote record. It requires confirmedByUser: true — if the caller has not obtained explicit user confirmation, this tool returns an error rather than creating anything. Repeated calls with the same idempotencyKey are safe and will not create duplicate quotes; the first result is returned again unchanged.",
      inputSchema: CreateRenewalQuoteInputSchema.shape,
    },
    async (args) => {
      const confirmation = requireConfirmation("create_renewal_quote", {
        confirmedByUser: args.confirmedByUser,
      });
      if (!confirmation.satisfied) {
        const result = {
          ok: false,
          error: { code: "CONFIRMATION_REQUIRED", message: confirmation.reason ?? "Confirmation required", retryable: false },
          meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" },
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> };
      }
      const result = await withIdempotency(renewalQuoteStore, args.idempotencyKey, () =>
        gateway.createRenewalQuote(args)
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> };
    }
  );
}

export function registerAddQuoteLine(server: McpServer, gateway: RevenueGateway): void {
  server.registerTool(
    "add_quote_line",
    {
      title: "Add Quote Line",
      description:
        "Adds a line item to an existing quote. This mutates Salesforce (or the mock) state: it creates a real quote line record on the target quote. Repeated calls with the same idempotencyKey are safe and will not create duplicate line items; the first result is returned again unchanged.",
      inputSchema: AddQuoteLineInputSchema.shape,
    },
    async (args) => {
      const result = await withIdempotency(addLineStore, args.idempotencyKey, () =>
        gateway.addQuoteLine(args)
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> };
    }
  );
}

export function registerApplyDiscount(server: McpServer, gateway: RevenueGateway): void {
  server.registerTool(
    "apply_discount",
    {
      title: "Apply Discount",
      description:
        "Applies a discount to an existing quote. This mutates Salesforce (or the mock) state: it updates the quote's discount. Policy bands: 0-15% is permitted without additional approval; 15.01-25% requires manager approval (confirmedByUser: true must be set); above 25% is rejected outright regardless of confirmation. Repeated calls with the same idempotencyKey are safe and will not apply the discount twice; the first result is returned again unchanged.",
      inputSchema: ApplyDiscountInputSchema.shape,
    },
    async (args) => {
      const evaluation = evaluateDiscount(args.discountPercent);
      if (evaluation.decision === "rejected") {
        const result = {
          ok: false,
          error: { code: "DISCOUNT_REJECTED", message: evaluation.reason ?? "Discount rejected by policy", retryable: false },
          meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" },
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> };
      }
      const confirmation = requireConfirmation("apply_discount", {
        discountDecision: evaluation.decision,
        confirmedByUser: args.confirmedByUser,
      });
      if (!confirmation.satisfied) {
        const result = {
          ok: false,
          error: { code: "CONFIRMATION_REQUIRED", message: confirmation.reason ?? "Confirmation required", retryable: false },
          meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "policy" },
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> };
      }
      const result = await withIdempotency(applyDiscountStore, args.idempotencyKey, () =>
        gateway.applyDiscount(args)
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown> };
    }
  );
}

export function registerMutationTools(server: McpServer, gateway: RevenueGateway): void {
  registerCreateInitialQuote(server, gateway);
  registerCreateRenewalQuote(server, gateway);
  registerAddQuoteLine(server, gateway);
  registerApplyDiscount(server, gateway);
}
