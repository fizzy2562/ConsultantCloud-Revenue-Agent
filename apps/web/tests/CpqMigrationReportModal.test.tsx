import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CpqMigrationReportModal } from "../components/CpqMigrationReportModal";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CpqMigrationReportModal", () => {
  it("renders its idle explanation and start button after opening", () => {
    render(<CpqMigrationReportModal />);
    fireEvent.click(screen.getByRole("button", { name: "Generate CPQ Migration Report" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/Analyzes your connected CPQ org/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run Analysis" })).toBeTruthy();
  });

  it("queries the CPQ org first, then synthesizes the report from that data", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ raw: { inspect_price_rules: { ok: true, data: {} } } }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ report: "## Report" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CpqMigrationReportModal />);
    fireEvent.click(screen.getByRole("button", { name: "Generate CPQ Migration Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Run Analysis" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/cpq-migration-report/query", { method: "POST" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/cpq-migration-report/synthesize", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("Report")).toBeTruthy();
  });
});
