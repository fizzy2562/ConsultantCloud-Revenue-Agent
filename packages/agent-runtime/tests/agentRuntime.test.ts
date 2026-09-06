import { afterEach, describe, expect, it, vi } from "vitest";
import { MockRevenueGateway } from "@consultantcloud/shared";
import { runAgentTurn, type PendingConfirmation } from "../src/index.js";
import type { ToolCallEvent } from "@consultantcloud/shared";
import { existsSync, readFileSync, unlinkSync } from "node:fs";

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
  it("uses one supplied runId across tool calls and falls back to a different generated ID", async () => {
    const eventFile = "./revenue-mcp-events.jsonl";
    if (existsSync(eventFile)) unlinkSync(eventFile);
    const readTurn = () => vi.fn()
      .mockResolvedValueOnce(ollamaResponse({ role: "assistant", content: "", tool_calls: [{ function: { name: "find_account", arguments: { name: "Acme" } } }] }))
      .mockResolvedValueOnce(ollamaResponse({ role: "assistant", content: "Done." }));

    vi.stubGlobal("fetch", readTurn());
    await runAgentTurn({ kind: "message", text: "Find Acme", history: [] }, new MockRevenueGateway(), { runId: "conversation-123" });
    vi.stubGlobal("fetch", readTurn());
    await runAgentTurn({ kind: "message", text: "Find Acme again", history: [] }, new MockRevenueGateway(), { runId: "conversation-123" });
    vi.stubGlobal("fetch", readTurn());
    await runAgentTurn({ kind: "message", text: "Find Acme separately", history: [] }, new MockRevenueGateway());

    const telemetryEvents = readFileSync(eventFile, "utf8").trim().split("\n").map((line) => JSON.parse(line) as ToolCallEvent);
    unlinkSync(eventFile);
    expect(telemetryEvents.map((event) => event.runId).slice(0, 2)).toEqual(["conversation-123", "conversation-123"]);
    expect(telemetryEvents[2]?.runId).not.toBe("conversation-123");
  });

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

  it("resolves a display quote number before executing a read with quoteId", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ollamaResponse({
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "get_quote_summary", arguments: { quoteId: "Q-10000" } } }],
      }))
      .mockResolvedValueOnce(ollamaResponse({ role: "assistant", content: "Quote found." }));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new MockRevenueGateway();
    const quoteSpy = vi.spyOn(gateway, "getQuoteSummary");

    const result = await runAgentTurn(
      { kind: "message", text: "Show quote Q-10000", history: [] },
      gateway
    );

    expect(result.message).toBe("Quote found.");
    expect(quoteSpy).toHaveBeenNthCalledWith(1, { quoteNumber: "Q-10000" });
    expect(quoteSpy).toHaveBeenNthCalledWith(2, { quoteId: "a0Q000000000001AAA" });
  });

  it("stores a resolved quote ID in a mutation confirmation and uses it when confirmed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ollamaResponse({
      role: "assistant",
      content: "",
      tool_calls: [{
        function: {
          name: "add_quote_line",
          arguments: { quoteId: "Q-10000", productId: "01t000000000002AAA", quantity: 2 },
        },
      }],
    })));
    const gateway = new MockRevenueGateway();
    const addLineSpy = vi.spyOn(gateway, "addQuoteLine");

    const proposed = await runAgentTurn(
      { kind: "message", text: "Add two Cloud Pro licenses to Q-10000", history: [] },
      gateway
    );

    expect(proposed.pendingConfirmation?.args.quoteId).toBe("a0Q000000000001AAA");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ollamaResponse({ role: "assistant", content: "Done." })));
    await runAgentTurn(
      { kind: "confirm", pending: proposed.pendingConfirmation!, history: [] },
      gateway
    );
    expect(addLineSpy).toHaveBeenCalledWith(expect.objectContaining({ quoteId: "a0Q000000000001AAA" }));
  });

  it("passes a Salesforce quote ID through without an extra lookup", async () => {
    const quoteId = "a0Q000000000001AAA";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ollamaResponse({
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "get_quote_summary", arguments: { quoteId } } }],
      }))
      .mockResolvedValueOnce(ollamaResponse({ role: "assistant", content: "Done." }));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new MockRevenueGateway();
    const quoteSpy = vi.spyOn(gateway, "getQuoteSummary");

    await runAgentTurn({ kind: "message", text: "Show the quote", history: [] }, gateway);

    expect(quoteSpy).toHaveBeenCalledOnce();
    expect(quoteSpy).toHaveBeenCalledWith({ quoteId });
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

  it("gates create_amendment_quote and calls the gateway only after confirmation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ollamaResponse({
      role: "assistant",
      content: "",
      tool_calls: [{
        function: {
          name: "create_amendment_quote",
          arguments: { accountId, sourceQuoteId: "Q-10000" },
        },
      }],
    })));
    const gateway = new MockRevenueGateway();
    const mutationSpy = vi.spyOn(gateway, "createAmendmentQuote");

    const proposed = await runAgentTurn(
      { kind: "message", text: "Create an amendment for Q-10000", history: [] },
      gateway
    );

    expect(mutationSpy).not.toHaveBeenCalled();
    expect(proposed.pendingConfirmation).toMatchObject({
      toolName: "create_amendment_quote",
      args: { accountId, sourceQuoteId: "a0Q000000000001AAA" },
      summary: {
        title: "Ready to create amendment quote",
        lines: [`Account: ${accountId}`, "Source quote: a0Q000000000001AAA"],
        confirmLabel: "Create amendment",
        cancelLabel: "Cancel",
      },
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ollamaResponse({ role: "assistant", content: "Done." })));
    await runAgentTurn({ kind: "confirm", pending: proposed.pendingConfirmation!, history: [] }, gateway);

    expect(mutationSpy).toHaveBeenCalledOnce();
    expect(mutationSpy).toHaveBeenCalledWith(expect.objectContaining({
      accountId,
      sourceQuoteId: "a0Q000000000001AAA",
      confirmedByUser: true,
      idempotencyKey: expect.any(String),
    }));
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

  it.each([
    ["remove_quote_line", { quoteLineId: "a0L000000000001AAA" }, "removeQuoteLine", "Ready to remove quote line"],
    ["update_quote_line", { quoteLineId: "a0L000000000001AAA", quantity: 3 }, "updateQuoteLine", "Ready to update quote line quantity"],
  ] as const)("gates %s and executes it only after confirmation", async (toolName, args, gatewayMethod, title) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ollamaResponse({
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: toolName, arguments: args } }],
    })));
    const gateway = new MockRevenueGateway();
    const mutationSpy = vi.spyOn(gateway, gatewayMethod);

    const proposed = await runAgentTurn({ kind: "message", text: "Change the quote line", history: [] }, gateway);

    expect(mutationSpy).not.toHaveBeenCalled();
    expect(proposed.pendingConfirmation).toMatchObject({ toolName, args, summary: { title, cancelLabel: "Cancel" } });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ollamaResponse({ role: "assistant", content: "Done." })));
    await runAgentTurn({ kind: "confirm", pending: proposed.pendingConfirmation!, history: [] }, gateway);

    expect(mutationSpy).toHaveBeenCalledOnce();
    expect(mutationSpy).toHaveBeenCalledWith(expect.objectContaining({ ...args, confirmedByUser: true, idempotencyKey: expect.any(String) }));
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

  it("uses a known product name in a mutation confirmation", async () => {
    const productId = "01t000000000002AAA";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ollamaResponse({
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: "search_products", arguments: { query: "Cloud Pro" } } }],
      }))
      .mockResolvedValueOnce(ollamaResponse({
        role: "assistant",
        content: "",
        tool_calls: [{
          function: {
            name: "add_quote_line",
            arguments: { quoteId: "a0Q000000000001AAA", productId, quantity: 10 },
          },
        }],
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAgentTurn(
      { kind: "message", text: "Add ten Cloud Pro licenses", history: [] },
      new MockRevenueGateway()
    );

    expect(result.pendingConfirmation?.summary.lines).toContain("Product: Cloud Pro");
    expect(result.pendingConfirmation?.summary.lines).not.toContain(`Product: ${productId}`);
  });

  it("marks only approval-band discount confirmations as requiring an approver name", async () => {
    const pendingFor = async (toolName: string, args: Record<string, unknown>) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ollamaResponse({
        role: "assistant",
        content: "",
        tool_calls: [{ function: { name: toolName, arguments: args } }],
      })));
      return (await runAgentTurn({ kind: "message", text: "Make a change", history: [] }, new MockRevenueGateway())).pendingConfirmation;
    };

    expect((await pendingFor("apply_discount", { quoteId: "q", quoteLineId: "ql", discountPercent: 20 }))?.summary.requiresApproverName).toBe(true);
    expect((await pendingFor("apply_discount", { quoteId: "q", quoteLineId: "ql", discountPercent: 15 }))?.summary.requiresApproverName).toBeUndefined();
    expect((await pendingFor("create_initial_quote", { accountId, termMonths: 12 }))?.summary.requiresApproverName).toBeUndefined();
  });

  it("blocks an approval-band discount without an approver and succeeds with one", async () => {
    const pending: PendingConfirmation = {
      toolName: "apply_discount",
      args: { quoteId: "a0Q000000000001AAA", quoteLineId: "a0L000000000001AAA", discountPercent: 20 },
      summary: { title: "Ready", lines: [], confirmLabel: "Confirm", cancelLabel: "Cancel", requiresApproverName: true },
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ollamaResponse({ role: "assistant", content: "Done." })));
    const blockedGateway = new MockRevenueGateway();
    const blockedSpy = vi.spyOn(blockedGateway, "applyDiscount");
    const blocked = await runAgentTurn({ kind: "confirm", pending, history: [] }, blockedGateway);
    expect(blockedSpy).not.toHaveBeenCalled();
    expect(blocked.message).toContain("manager's name is required");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ollamaResponse({ role: "assistant", content: "Done." })));
    const approvedGateway = new MockRevenueGateway();
    const approvedSpy = vi.spyOn(approvedGateway, "applyDiscount");
    const approved = await runAgentTurn({ kind: "confirm", pending, history: [], approverName: "Morgan Lee" }, approvedGateway);
    expect(approvedSpy).toHaveBeenCalledWith(expect.objectContaining({ approvedBy: "Morgan Lee", confirmedByUser: true }));
    expect(approved.message).toContain("20% discount applied");
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
