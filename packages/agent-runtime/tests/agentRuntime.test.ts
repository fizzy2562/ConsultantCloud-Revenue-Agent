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
