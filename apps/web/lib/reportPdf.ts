import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// This parser is deliberately narrow: it only needs to understand the exact Markdown shapes
// @consultantcloud/cpq-analysis's assembleReport() actually produces (headings up to ####, GFM
// tables, "- " bullet lists, fenced code blocks, **bold** spans, and "_..._"-wrapped method-note
// paragraphs) -- not arbitrary Markdown. That's what makes a hand-rolled parser reliable here
// instead of a liability: the input shape is fully known and fixed, not user-supplied.

type Block =
  | { type: "h1" | "h2" | "h3" | "h4"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; lines: string[] };

const ORDERED_LIST_MARKER = /^\d+\.\s/;

function parseTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("-") && /^\|?[\s:|-]+\|?$/.test(trimmed);
}

function fenceOf(line: string): string | null {
  const match = line.trim().match(/^`{3,}/);
  return match ? match[0] : null;
}

export function parseReportMarkdown(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const trimmed = raw.trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    if (trimmed.startsWith("#### ")) {
      blocks.push({ type: "h4", text: trimmed.slice(5).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "h3", text: trimmed.slice(4).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "h2", text: trimmed.slice(3).trim() });
      i++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      blocks.push({ type: "h1", text: trimmed.slice(2).trim() });
      i++;
      continue;
    }

    const fence = fenceOf(trimmed);
    if (fence) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim() !== fence) {
        codeLines.push(lines[i] ?? "");
        i++;
      }
      i++; // skip the closing fence line
      blocks.push({ type: "code", lines: codeLines });
      continue;
    }

    if (trimmed.startsWith("|") && isTableSeparator(lines[i + 1] ?? "")) {
      const headers = parseTableRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        rows.push(parseTableRow(lines[i] ?? ""));
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (trimmed.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("- ")) {
        items.push((lines[i] ?? "").trim().slice(2).trim());
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Standard Markdown treats consecutive "N. " lines as an ordered list even with no blank
    // line between them (confirmed: buildSequencingSection.ts emits exactly this shape, and it
    // renders correctly as a numbered list in the web view via remark-gfm) -- without this branch
    // every step collapses into one run-on paragraph here instead.
    if (ORDERED_LIST_MARKER.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && ORDERED_LIST_MARKER.test((lines[i] ?? "").trim())) {
        items.push((lines[i] ?? "").trim());
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const paraLines = [trimmed];
    i++;
    while (i < lines.length) {
      const next = (lines[i] ?? "").trim();
      if (next === "" || next.startsWith("#") || next.startsWith("- ") || next.startsWith("|") || fenceOf(next) || ORDERED_LIST_MARKER.test(next)) break;
      paraLines.push(next);
      i++;
    }
    blocks.push({ type: "p", text: paraLines.join(" ") });
  }

  return blocks;
}

function stripInlineMarkers(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

const PAGE_MARGIN = 42;
const TEXT_COLOR: [number, number, number] = [31, 41, 55];
const MUTED_COLOR: [number, number, number] = [107, 114, 128];
const HEADING_COLOR: [number, number, number] = [36, 75, 101];

interface RenderState {
  doc: jsPDF;
  y: number;
  pageHeight: number;
  contentWidth: number;
}

function newPageIfNeeded(state: RenderState, neededHeight: number) {
  if (state.y + neededHeight > state.pageHeight - PAGE_MARGIN) {
    state.doc.addPage();
    state.y = PAGE_MARGIN;
  }
}

function drawHeading(state: RenderState, text: string, size: number, spacingBefore: number, spacingAfter: number) {
  newPageIfNeeded(state, size + spacingBefore + spacingAfter);
  state.y += spacingBefore;
  state.doc.setFont("helvetica", "bold");
  state.doc.setFontSize(size);
  state.doc.setTextColor(...HEADING_COLOR);
  const wrapped = state.doc.splitTextToSize(text, state.contentWidth) as string[];
  for (const line of wrapped) {
    newPageIfNeeded(state, size * 1.3);
    state.doc.text(line, PAGE_MARGIN, state.y);
    state.y += size * 1.3;
  }
  state.y += spacingAfter;
  state.doc.setTextColor(...TEXT_COLOR);
}

/**
 * Word-wraps `text` starting at (x, state.y), honoring **bold** spans by switching font weight
 * mid-line rather than stripping them -- the report leans on bold labels ("**Overall readiness:**
 * 52/100") throughout, and losing that would make a "logically formatted" report look flatter
 * than the Markdown it's rendered from.
 */
function drawFormattedText(
  state: RenderState,
  text: string,
  x: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  italic = false
) {
  state.doc.setFontSize(fontSize);
  const segments = text.split(/(\*\*[^*]+\*\*)/g).filter((segment) => segment.length > 0);
  const spaceWidth = state.doc.getTextWidth(" ");
  let cursorX = x;
  let firstWordOnLine = true;
  newPageIfNeeded(state, lineHeight);

  for (const segment of segments) {
    const bold = segment.startsWith("**") && segment.endsWith("**");
    const content = bold ? segment.slice(2, -2) : segment;
    const style = bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal";
    state.doc.setFont("helvetica", style);

    for (const word of content.split(/\s+/).filter((w) => w.length > 0)) {
      const wordWidth = state.doc.getTextWidth(word);
      const needed = (firstWordOnLine ? 0 : spaceWidth) + wordWidth;
      if (!firstWordOnLine && cursorX + needed > x + maxWidth) {
        cursorX = x;
        state.y += lineHeight;
        newPageIfNeeded(state, lineHeight);
        firstWordOnLine = true;
      }
      if (!firstWordOnLine) cursorX += spaceWidth;
      state.doc.text(word, cursorX, state.y);
      cursorX += wordWidth;
      firstWordOnLine = false;
    }
  }
  state.y += lineHeight;
}

function drawParagraph(state: RenderState, text: string) {
  const isMethodNote = text.startsWith("_") && text.endsWith("_") && text.length > 1;
  const content = isMethodNote ? text.slice(1, -1) : text;
  if (isMethodNote) state.doc.setTextColor(...MUTED_COLOR);
  drawFormattedText(state, content, PAGE_MARGIN, state.contentWidth, 9.5, 13, isMethodNote);
  if (isMethodNote) state.doc.setTextColor(...TEXT_COLOR);
  state.y += 4;
}

function drawList(state: RenderState, items: string[]) {
  for (const item of items) {
    newPageIfNeeded(state, 13);
    state.doc.setFont("helvetica", "normal");
    state.doc.setFontSize(9.5);
    state.doc.setTextColor(...TEXT_COLOR);
    state.doc.text("•", PAGE_MARGIN + 2, state.y);
    drawFormattedText(state, item, PAGE_MARGIN + 14, state.contentWidth - 14, 9.5, 13);
  }
  state.y += 4;
}

/**
 * Each item's own text already starts with its "N. " marker (the source data, not something this
 * renderer invents), so that prefix is drawn as the hanging marker and the rest gets the same
 * indent as a bullet item. Extra gap between items: unlike short bullets, these tend to be full
 * paragraphs (e.g. the sequencing recommendation's numbered steps), so they read better separated.
 */
function drawOrderedList(state: RenderState, items: string[]) {
  for (const item of items) {
    const match = item.match(/^(\d+\.)\s(.*)$/s);
    const marker = match ? (match[1] ?? "") : "";
    const rest = match ? (match[2] ?? item) : item;
    newPageIfNeeded(state, 13);
    state.doc.setFont("helvetica", "bold");
    state.doc.setFontSize(9.5);
    state.doc.setTextColor(...TEXT_COLOR);
    state.doc.text(marker, PAGE_MARGIN, state.y);
    drawFormattedText(state, rest, PAGE_MARGIN + 20, state.contentWidth - 20, 9.5, 13);
    state.y += 8;
  }
  state.y += 2;
}

function drawTable(state: RenderState, headers: string[], rows: string[][]) {
  newPageIfNeeded(state, 60);
  autoTable(state.doc, {
    startY: state.y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [headers.map(stripInlineMarkers)],
    body: rows.map((row) => row.map(stripInlineMarkers)),
    styles: { fontSize: 8.5, cellPadding: 4, textColor: TEXT_COLOR, lineColor: [209, 213, 219], lineWidth: 0.5 },
    headStyles: { fillColor: HEADING_COLOR, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    theme: "grid",
  });
  const finalY = (state.doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  state.y = (finalY ?? state.y) + 14;
  state.doc.setTextColor(...TEXT_COLOR);
}

function drawCodeBlock(state: RenderState, lines: string[]) {
  const doc = state.doc;
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  const lineHeight = 10;
  const padding = 6;

  const wrapped: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      wrapped.push("");
      continue;
    }
    const split = doc.splitTextToSize(line, state.contentWidth - padding * 2) as string[];
    wrapped.push(...split);
  }

  state.y += 4;
  let index = 0;
  while (index < wrapped.length) {
    const available = state.pageHeight - PAGE_MARGIN - state.y;
    if (available < lineHeight + padding * 2) {
      doc.addPage();
      state.y = PAGE_MARGIN;
      continue;
    }
    const maxLines = Math.max(1, Math.floor((available - padding * 2) / lineHeight));
    const chunk = wrapped.slice(index, index + maxLines);
    const chunkHeight = chunk.length * lineHeight + padding * 2;

    doc.setFillColor(31, 41, 55);
    doc.rect(PAGE_MARGIN, state.y, state.contentWidth, chunkHeight, "F");
    doc.setTextColor(243, 244, 246);
    let lineY = state.y + padding + lineHeight * 0.75;
    for (const codeLine of chunk) {
      doc.text(codeLine, PAGE_MARGIN + padding, lineY);
      lineY += lineHeight;
    }

    state.y += chunkHeight + 8;
    index += chunk.length;
    if (index < wrapped.length) {
      doc.addPage();
      state.y = PAGE_MARGIN;
    }
  }
  doc.setTextColor(...TEXT_COLOR);
  state.y += 6;
}

/** Builds the PDF document without triggering a browser download -- split out so it can be
 * generated to a Buffer (Node scripts, tests) as well as saved directly in the browser. */
export function buildReportPdfDocument(markdown: string): jsPDF {
  const blocks = parseReportMarkdown(markdown);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const state: RenderState = { doc, y: PAGE_MARGIN, pageHeight, contentWidth: pageWidth - PAGE_MARGIN * 2 };

  doc.setTextColor(...TEXT_COLOR);

  for (const block of blocks) {
    switch (block.type) {
      case "h1":
        drawHeading(state, block.text, 18, state.y === PAGE_MARGIN ? 0 : 10, 12);
        break;
      case "h2":
        drawHeading(state, block.text, 14, 14, 8);
        break;
      case "h3":
        drawHeading(state, block.text, 11.5, 10, 6);
        break;
      case "h4":
        drawHeading(state, block.text, 10.5, 8, 4);
        break;
      case "p":
        drawParagraph(state, block.text);
        break;
      case "ul":
        drawList(state, block.items);
        break;
      case "ol":
        drawOrderedList(state, block.items);
        break;
      case "table":
        drawTable(state, block.headers, block.rows);
        break;
      case "code":
        drawCodeBlock(state, block.lines);
        break;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED_COLOR);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 20, { align: "right" });
    doc.text("CPQ -> Revenue Cloud Migration Readiness Report", PAGE_MARGIN, pageHeight - 20);
  }

  return doc;
}

export function generateReportPdf(markdown: string, filename = "CPQ-Migration-Report.pdf"): void {
  buildReportPdfDocument(markdown).save(filename);
}
