import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { ChatApp } from "../components/ChatApp";

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ChatApp", () => {
  it("renders Markdown for agent messages but keeps user messages literal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          message: "The agent rendered **bold text**.",
          trace: [],
          pendingConfirmation: null,
        })
      )
    );

    render(<ChatApp />);
    const input = screen.getByLabelText("Message");
    fireEvent.change(input, { target: { value: "User typed **text**" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const userText = screen.getByText("User typed **text**");
    expect(userText.querySelector("strong")).toBeNull();

    const agentText = await screen.findByText("bold text");
    expect(agentText.tagName).toBe("STRONG");
    expect(agentText.closest(".cc-chat-bubble")?.textContent).not.toContain("**bold text**");
  });

  it("shows a confirmation card as its own element once the backend proposes a mutation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          message: "Ready to create renewal quote. Please review the details and confirm to continue.",
          trace: [{ tool: "find_account", badge: "READ", durationMs: 100, blocked: false, summary: "Acme University found" }],
          pendingConfirmation: {
            toolName: "create_renewal_quote",
            args: { accountId: "001", termMonths: 36, effectiveDate: "2026-10-01" },
            summary: {
              title: "Ready to create renewal quote",
              lines: ["Account: Acme University", "Term: 36 months"],
              confirmLabel: "Create renewal",
              cancelLabel: "Cancel",
            },
          },
        })
      )
    );

    render(<ChatApp />);
    const starter = screen.getByText("Renew Acme University for 3 years and increase Cloud Pro to 250 seats.");
    fireEvent.click(starter);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Ready to create renewal quote")).toBeTruthy();
  });

  it("never shows a confirmation card when the backend returns none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          message: "A 30% discount exceeds the maximum permitted discount of 25% and has been rejected outright.",
          trace: [{ tool: "apply_discount", badge: "GATE", durationMs: 5, blocked: true, summary: "Rejected: exceeds 25% maximum" }],
          pendingConfirmation: null,
        })
      )
    );

    render(<ChatApp />);
    const starter = screen.getByText("Try to give Acme University a 30% discount.");
    fireEvent.click(starter);

    await screen.findByText(/rejected outright/);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hides the confirmation card and shows the after-confirm message once confirmed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          message: "Ready to create renewal quote. Please review the details and confirm to continue.",
          trace: [],
          pendingConfirmation: {
            toolName: "create_renewal_quote",
            args: { accountId: "001", termMonths: 36, effectiveDate: "2026-10-01" },
            summary: {
              title: "Ready to create renewal quote",
              lines: ["Account: Acme University", "Term: 36 months"],
              confirmLabel: "Create renewal",
              cancelLabel: "Cancel",
            },
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          message: "Renewal quote Q-10452 created for Acme University.",
          trace: [{ tool: "create_renewal_quote", badge: "WRITE", durationMs: 480, blocked: false, summary: "Quote Q-10452 created" }],
          pendingConfirmation: null,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatApp />);
    const starter = screen.getByText("Renew Acme University for 3 years and increase Cloud Pro to 250 seats.");
    fireEvent.click(starter);

    const alert = await screen.findByRole("alert");
    const confirmBtn = within(alert).getByText("Create renewal");
    fireEvent.click(confirmBtn);

    await screen.findByText("Renewal quote Q-10452 created for Acme University.");
    expect(screen.queryByRole("alert")).toBeNull();

    const secondCallBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string);
    expect(secondCallBody.kind).toBe("confirm");
    expect(secondCallBody.pending.toolName).toBe("create_renewal_quote");
    expect(secondCallBody.conversationId).toBe(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string).conversationId);
  });

  it("requires and submits a manager name for an approval-band discount", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        message: "Approval required.",
        trace: [],
        pendingConfirmation: {
          toolName: "apply_discount",
          args: { quoteId: "q", quoteLineId: "ql", discountPercent: 20 },
          summary: {
            title: "Ready to apply discount",
            lines: ["Discount: 20%"],
            confirmLabel: "Apply discount",
            cancelLabel: "Cancel",
            requiresApproverName: true,
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ message: "20% discount applied.", trace: [], pendingConfirmation: null }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatApp />);
    fireEvent.click(screen.getByText("Give Acme University a 20% discount."));
    const alert = await screen.findByRole("alert");
    const confirm = within(alert).getByText("Apply discount") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(alert).getByPlaceholderText("Approving manager's name"), { target: { value: "  Morgan Lee  " } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string);
    expect(body.approverName).toBe("Morgan Lee");
  });
});
