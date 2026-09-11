import { describe, it, expect } from "vitest";
import { parseReportMarkdown, buildReportPdfDocument } from "../lib/reportPdf";

const SAMPLE_REPORT = [
  "# CPQ -> Revenue Cloud Migration Readiness Report",
  "",
  "## Executive Summary",
  "",
  "**Overall readiness:** 50 / 100 (Provisional)",
  "",
  "_This score is Provisional: coverage is below 70%._",
  "",
  "### CPQ footprint",
  "",
  "| Metric | Count |",
  "|---|---:|",
  "| Products | 161 |",
  "| Price Rules | 1 |",
  "",
  "### Next decisions",
  "",
  "- Confirm the target Revenue Cloud release before finalizing design.",
  "- Review every INVESTIGATE item with the business owner.",
  "",
  "#### DEMO Script (a0B123)",
  "",
  "781 characters. **Manual review required:** assess this script for migration impact.",
  "",
  "```javascript",
  "function calculate(quote) {",
  "  return quote.total * 1.1;",
  "}",
  "```",
  "",
].join("\n");

describe("parseReportMarkdown", () => {
  it("parses headings at every level", () => {
    const blocks = parseReportMarkdown(SAMPLE_REPORT);
    expect(blocks).toContainEqual({ type: "h1", text: "CPQ -> Revenue Cloud Migration Readiness Report" });
    expect(blocks).toContainEqual({ type: "h2", text: "Executive Summary" });
    expect(blocks).toContainEqual({ type: "h3", text: "CPQ footprint" });
    expect(blocks).toContainEqual({ type: "h4", text: "DEMO Script (a0B123)" });
  });

  it("parses a GFM table into headers and rows, not as a paragraph", () => {
    const blocks = parseReportMarkdown(SAMPLE_REPORT);
    const table = blocks.find((b) => b.type === "table");
    expect(table).toBeTruthy();
    if (table?.type !== "table") return;
    expect(table.headers).toEqual(["Metric", "Count"]);
    expect(table.rows).toEqual([
      ["Products", "161"],
      ["Price Rules", "1"],
    ]);
  });

  it("parses a bullet list as one block with all items, not separate paragraphs", () => {
    const blocks = parseReportMarkdown(SAMPLE_REPORT);
    const list = blocks.find((b) => b.type === "ul");
    expect(list).toBeTruthy();
    if (list?.type !== "ul") return;
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toContain("Confirm the target Revenue Cloud release");
  });

  it("parses consecutive \"N. \" lines with no blank line between them as one ordered-list block, not a run-on paragraph", () => {
    // This is the exact shape buildSequencingSection.ts actually emits, and standard Markdown
    // (remark-gfm, used for the web view) treats it as a numbered list even with no blank lines
    // between items -- a real gap this test guards against regressing.
    const markdown = ["## Sequencing recommendation", "", "1. Catalog first.", "2. Discount Schedules next.", "3. Twin Fields last."].join("\n");
    const blocks = parseReportMarkdown(markdown);
    const list = blocks.find((b) => b.type === "ol");
    expect(list).toBeTruthy();
    if (list?.type !== "ol") return;
    expect(list.items).toEqual(["1. Catalog first.", "2. Discount Schedules next.", "3. Twin Fields last."]);
    expect(blocks.some((b) => b.type === "p")).toBe(false);
  });

  it("parses a fenced code block, preserving line breaks and excluding the fence markers themselves", () => {
    const blocks = parseReportMarkdown(SAMPLE_REPORT);
    const code = blocks.find((b) => b.type === "code");
    expect(code).toBeTruthy();
    if (code?.type !== "code") return;
    expect(code.lines).toEqual(["function calculate(quote) {", "  return quote.total * 1.1;", "}"]);
    expect(code.lines.join("\n")).not.toContain("```");
  });

  it("keeps a bold-labeled sentence and a method-note (underscore-wrapped) sentence as separate paragraph blocks", () => {
    const blocks = parseReportMarkdown(SAMPLE_REPORT);
    const paragraphs = blocks.filter((b) => b.type === "p").map((b) => (b as { text: string }).text);
    expect(paragraphs.some((p) => p.includes("**Overall readiness:**"))).toBe(true);
    expect(paragraphs.some((p) => p.startsWith("_This score is Provisional"))).toBe(true);
  });

  it("does not lose or merge a script's own body text into the surrounding structure", () => {
    const blocks = parseReportMarkdown(SAMPLE_REPORT);
    const paragraphs = blocks.filter((b) => b.type === "p").map((b) => (b as { text: string }).text);
    expect(paragraphs.some((p) => p.includes("Manual review required"))).toBe(true);
  });
});

describe("buildReportPdfDocument", () => {
  // Deliberately tests buildReportPdfDocument (construction only), not generateReportPdf --
  // jsPDF's .save() writes a real file to disk outside a real browser (confirmed: running
  // generateReportPdf() here left stray .pdf files in apps/web on every test run), so the save
  // side-effect itself is exercised only via the mocked module in CpqMigrationReportModal.test.tsx.
  it("builds a multi-page PDF document from a full report shape without throwing", () => {
    expect(() => buildReportPdfDocument(SAMPLE_REPORT)).not.toThrow();
    const doc = buildReportPdfDocument(SAMPLE_REPORT);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it("still produces a document for an empty report body instead of throwing", () => {
    expect(() => buildReportPdfDocument("# Title only")).not.toThrow();
  });
});
