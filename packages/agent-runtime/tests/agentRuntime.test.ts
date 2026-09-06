import { afterEach, describe, expect, it, vi } from "vitest";
import { MockRevenueGateway } from "@consultantcloud/shared";
import { runAgentTurn, type PendingConfirmation } from "../src/index.js";

const accountId = "001000000000001AAA";

function ollamaResponse(message: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ message }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("agent runtime", () => {
  it("executes read tools and feeds their real results back to the model", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ollamaResponse({
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "find_account", arguments: { name: "Acme" } } }],
      }))
      .mockResolvedValueOnce(ollamaResponse({
        role: "assistant",
        content: "I found Acme University.",
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAgentTurn(
      { kind: "message", text: "Find Acme", history: [] },
      new MockRevenueGateway()
    );

    expect(result.message).toBe("I found Acme University.");
    expect(result.pendingConfirmation).toBeNull();
    expect(result.trace).toMatchObject([
      { tool: "find_account", badge: "READ", blocked: false, summary: "Acme University found" },
    ]);
    const secondRequest = JSON.parse(fetchMock.mock.calls[1]![1].body as string);
    expect(secondRequest.messages.at(-1)).toMatchObject({ role: "tool", tool_name: "find_account" });
    expect(JSON.parse(secondRequest.messages.at(-1).content).data[0].name).toBe("Acme University");
  });

  it("turns a model-requested mutation into a pending confirmation without executing it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ollamaResponse({
      role: "assistant",
      content: "",
      tool_calls: [{
        function: {
          name: "create_renewal_quote",
          arguments: {
            accountId,
            termMonths: 36,
            effectiveDate: "2026-10-01",
            confirmedByUser: true,
            idempotencyKey: "model-controlled-key",
          },
        },
      }],
    })));
    const gateway = new MockRevenueGateway();
    const mutationSpy = vi.spyOn(gateway, "createRenewalQuote");

    const result = await runAgentTurn(
      { kind: "message", text: "Renew Acme for three years", history: [] },
      gateway
    );

    expect(mutationSpy).not.toHaveBeenCalled();
    expect(result.pendingConfirmation).toMatchObject({
      toolName: "create_renewal_quote",
      args: { accountId, termMonths: 36, effectiveDate: "2026-10-01" },
      summary: { title: "Ready to create renewal quote", confirmLabel: "Create renewal", cancelLabel: "Cancel" },
    });
  });

  it("executes a pending mutation only on confirmation with runtime-controlled authorization", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ollamaResponse({
      role: "assistant",
      content: "The renewal is ready.",
    })));
    const gateway = new MockRevenueGateway();
    const mutationSpy = vi.spyOn(gateway, "createRenewalQuote");
    const pending: PendingConfirmation = {
      toolName: "create_renewal_quote",
      args: {
        accountId,
        termMonths: 36,
        effectiveDate: "2026-10-01",
        confirmedByUser: false,
        idempotencyKey: "model-controlled-key",
      },
      summary: { title: "Ready to create renewal quote", lines: [], confirmLabel: "Create renewal", cancelLabel: "Cancel" },
    };

    const result = await runAgentTurn({ kind: "confirm", pending, history: [] }, gateway);

    expect(mutationSpy).toHaveBeenCalledOnce();
    expect(mutationSpy).toHaveBeenCalledWith(expect.objectContaining({
      accountId,
      confirmedByUser: true,
      idempotencyKey: expect.any(String),
    }));
    expect(mutationSpy.mock.calls[0]![0].idempotencyKey).not.toBe("model-controlled-key");
    expect(result.pendingConfirmation).toBeNull();
    expect(result.trace).toMatchObject([{ tool: "create_renewal_quote", badge: "WRITE", blocked: false }]);
  });

  it("uses a known quote number in a mutation confirmation", async () => {
    const quoteId = "a0Q000000000001AAA";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ollamaResponse({
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "get_quote_summary", arguments: { quoteId } } }],
      }))
      .mockResolvedValueOnce(ollamaResponse({
        role: "assistant",
        content: "",
        tool_calls: [{
          function: {
            name: "apply_discount",
            arguments: { quoteId, quoteLineId: "a1Q000000000001AAA", discountPercent: 10 },
          },
        }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAgentTurn(
      { kind: "message", text: "Apply a discount to quote Q-10000", history: [] },
      new MockRevenueGateway()
    );

    expect(result.pendingConfirmation?.summary.lines).toContain("Quote: Q-10000");
    expect(result.pendingConfirmation?.summary.lines).not.toContain(`Quote: ${quoteId}`);
  });

  it("gates a second mutation proposed after a confirmed mutation", async () => {
    const nextQuoteId = "a0Q-follow-up";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ollamaResponse({
      role: "assistant",
      content: "",
      tool_calls: [{
        function: {
          name: "add_quote_line",
          arguments: { quoteId: nextQuoteId, productId: "01t-cloud-pro", quantity: 250 },
        },
      }],
    })));
    const gateway = new MockRevenueGateway();
    const renewalSpy = vi.spyOn(gateway, "createRenewalQuote");
    const addLineSpy = vi.spyOn(gateway, "addQuoteLine");
    const pending: PendingConfirmation = {
      toolName: "create_renewal_quote",
      args: { accountId, termMonths: 36, effectiveDate: "2026-10-01" },
      summary: { title: "Ready", lines: [], confirmLabel: "Confirm", cancelLabel: "Cancel" },
    };

    const result = await runAgentTurn({ kind: "confirm", pending, history: [] }, gateway);

    expect(renewalSpy).toHaveBeenCalledOnce();
    expect(addLineSpy).not.toHaveBeenCalled();
    expect(result.pendingConfirmation).toMatchObject({
      toolName: "add_quote_line",
      args: { quoteId: nextQuoteId, productId: "01t-cloud-pro", quantity: 250 },
    });
    expect(result.message).toContain("created");
  });

  it("returns a completed confirmed mutation when no follow-up tool is needed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ollamaResponse({
      role: "assistant",
      content: "No further action is needed.",
    })));
    const pending: PendingConfirmation = {
      toolName: "create_renewal_quote",
      args: { accountId, termMonths: 36, effectiveDate: "2026-10-01" },
      summary: { title: "Ready", lines: [], confirmLabel: "Confirm", cancelLabel: "Cancel" },
    };

    const result = await runAgentTurn({ kind: "confirm", pending, history: [] }, new MockRevenueGateway());

    expect(result.pendingConfirmation).toBeNull();
    expect(result.message).toContain("created");
    expect(result.message).toContain("No further action is needed.");
  });

  it("cancels without calling the gateway", async () => {
    const gateway = new MockRevenueGateway();
    const mutationSpy = vi.spyOn(gateway, "createRenewalQuote");
    const pending: PendingConfirmation = {
      toolName: "create_renewal_quote",
      args: { accountId, termMonths: 36, effectiveDate: "2026-10-01" },
      summary: { title: "Ready", lines: [], confirmLabel: "Confirm", cancelLabel: "Cancel" },
    };

    const result = await runAgentTurn({ kind: "cancel", pending, history: [] }, gateway);

    expect(mutationSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ message: "No changes made.", trace: [], pendingConfirmation: null });
  });
});
