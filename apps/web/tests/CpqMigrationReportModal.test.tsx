import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CpqMigrationReportModal } from "../components/CpqMigrationReportModal";

const generateReportPdfMock = vi.fn();
vi.mock("../lib/reportPdf", () => ({
  generateReportPdf: (...args: unknown[]) => generateReportPdfMock(...args),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  generateReportPdfMock.mockClear();
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

  it("offers a Download PDF button next to View raw data once the report is ready, and it generates a PDF from the report Markdown", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ raw: { inspect_price_rules: { ok: true, data: {} } } }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ report: "## Report" }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CpqMigrationReportModal />);
    fireEvent.click(screen.getByRole("button", { name: "Generate CPQ Migration Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Run Analysis" }));
    await screen.findByText("Report");

    const actionButtons = screen.getAllByRole("button").map((button) => button.textContent);
    const rawIndex = actionButtons.indexOf("View raw data");
    const pdfIndex = actionButtons.indexOf("Download PDF");
    expect(rawIndex).toBeGreaterThan(-1);
    expect(pdfIndex).toBe(rawIndex + 1);

    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(generateReportPdfMock).toHaveBeenCalledTimes(1);
    expect(generateReportPdfMock).toHaveBeenCalledWith("## Report");
  });
});
