"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { generateReportPdf } from "../lib/reportPdf";

type QueryResponse = { raw?: unknown; error?: unknown };
type SynthesizeResponse = { report?: unknown; error?: unknown };
type Status = "idle" | "querying" | "synthesizing" | "done" | "error";
// "pre" is required so fenced code blocks (the Custom Scripts section's raw QCP source) render
// as a proper block with preserved whitespace/newlines, rather than being unwrapped to an inline
// "code" span (unwrapDisallowed strips any element not in this list, keeping only its children).
const ALLOWED_ELEMENTS = ["h1", "h2", "h3", "p", "strong", "em", "ul", "ol", "li", "code", "pre", "br", "table", "thead", "tbody", "tr", "th", "td"];

const QUERY_STEPS = [
  "Checking Price Rules and Conditions...",
  "Checking Discount Schedules and Tiers...",
  "Checking Product and Configuration Rules...",
  "Checking Custom Scripts (Quote Calculator Plugins)...",
  "Checking catalog structure — Products, Options, Features...",
  "Scanning for Twin Fields across Product2, Quote Line, and Subscription...",
];

// Assembly is entirely deterministic (fixed mapping tables and rubrics, no LLM call anywhere), so
// this finishes in a couple of seconds -- the rotation just needs to keep the spinner feeling
// alive for that short a window, not narrate a long wait.
const SYNTHESIZE_STEPS = [
  "Mapping every category to its Revenue Cloud target object...",
  "Applying the complexity/risk rubric...",
  "Computing the migration blast radius...",
  "Drafting the sequencing recommendation...",
];

function CloudSpinnerIcon() {
  return (
    <svg className="cc-cloud-spinner" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.5 19H7a4.5 4.5 0 0 1-.62-8.96A5.5 5.5 0 0 1 17 8.5a4 4 0 0 1 1.5 7.5v3z"
        opacity="0.25"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        d="M18.5 19H7a4.5 4.5 0 0 1-.62-8.96A5.5 5.5 0 0 1 17 8.5a4 4 0 0 1 1.5 7.5"
      />
    </svg>
  );
}

function useRotatingMessage(steps: string[], active: boolean, intervalMs = 3500): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) { setIndex(0); return; }
    const timer = setInterval(() => setIndex((value) => (value + 1) % steps.length), intervalMs);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, steps.length, intervalMs]);
  return steps[index] ?? steps[0] ?? "";
}

export function CpqMigrationReportModal() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [report, setReport] = useState("");
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const queryStep = useRotatingMessage(QUERY_STEPS, status === "querying", 900);
  // Report assembly is fast and entirely deterministic -- rotate quickly rather than narrate a
  // long wait.
  const synthesizeStep = useRotatingMessage(SYNTHESIZE_STEPS, status === "synthesizing", 700);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const listener = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [open]);

  async function runAnalysis() {
    setError(""); setCopied(false); setShowRaw(false);
    try {
      setStatus("querying");
      const queryResponse = await fetch("/api/cpq-migration-report/query", { method: "POST" });
      const queryBody = await queryResponse.json().catch(() => ({})) as QueryResponse;
      if (!queryResponse.ok) throw new Error(typeof queryBody.error === "string" ? queryBody.error : `CPQ query failed with HTTP ${queryResponse.status}`);
      if (typeof queryBody.raw !== "object" || queryBody.raw === null) throw new Error("The CPQ query returned an invalid response");
      setRaw(queryBody.raw);

      setStatus("synthesizing");
      const synthesizeResponse = await fetch("/api/cpq-migration-report/synthesize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw: queryBody.raw }),
      });
      const synthesizeBody = await synthesizeResponse.json().catch(() => ({})) as SynthesizeResponse;
      if (!synthesizeResponse.ok) throw new Error(typeof synthesizeBody.error === "string" ? synthesizeBody.error : `Report generation failed with HTTP ${synthesizeResponse.status}`);
      if (typeof synthesizeBody.report !== "string") throw new Error("The report service returned an invalid response");
      setReport(synthesizeBody.report); setStatus("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The report request could not be completed"); setStatus("error");
    }
  }

  async function copyReport() {
    try { await navigator.clipboard.writeText(report); setCopied(true); } catch { setCopied(false); }
  }

  function downloadPdf() {
    // Renders the report's own Markdown into a real PDF via jsPDF (headings, tables via
    // jspdf-autotable, bullet lists, code blocks, **bold** spans) and saves it directly -- no
    // print dialog, no browser "destination" picker, no rasterized screenshot. See
    // lib/reportPdf.ts.
    generateReportPdf(report);
  }

  return <>
    <button type="button" className="cc-migration-trigger" disabled={status === "querying" || status === "synthesizing"} onClick={() => setOpen(true)}>Generate CPQ Migration Report</button>
    {open && <div className="cc-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="cc-modal" role="dialog" aria-modal="true" aria-labelledby="cc-migration-title">
        <header className="cc-modal__header"><div><span className="cc-badge-read">READ-ONLY ANALYSIS</span><h2 id="cc-migration-title">CPQ Migration Report</h2></div><button ref={closeRef} type="button" className="cc-modal__close" aria-label="Close migration report" onClick={() => setOpen(false)}>×</button></header>
        <div className="cc-modal__body">
          {status === "idle" && <><p>Analyzes your connected CPQ org&apos;s Price Rules, Discount Schedules, Product Rules, Custom Scripts, catalog structure, and Twin Fields, and proposes how each maps to Revenue Cloud.</p><button type="button" className="cc-confirmation-card__button--primary" onClick={runAnalysis}>Run Analysis</button></>}
          {status === "querying" && <div className="cc-migration-running" role="status"><CloudSpinnerIcon /><div><strong>Querying CPQ org...</strong><span className="cc-migration-running__step">{queryStep}</span></div></div>}
          {status === "synthesizing" && <div className="cc-migration-running" role="status"><CloudSpinnerIcon /><div><strong>Assembling the report — this only takes a few seconds...</strong><span className="cc-migration-running__step">{synthesizeStep}</span></div></div>}
          {status === "error" && <div role="alert" className="cc-migration-error"><strong>Analysis failed:</strong> {error}<div><button type="button" className="cc-confirmation-card__button--primary" onClick={runAnalysis}>Try Again</button></div></div>}
          {status === "done" && <><div className="cc-modal__actions"><button type="button" className="cc-confirmation-card__button--secondary" onClick={copyReport}>{copied ? "Copied" : "Copy report as Markdown"}</button><button type="button" className="cc-confirmation-card__button--secondary" aria-expanded={showRaw} onClick={() => setShowRaw((value) => !value)}>{showRaw ? "Hide raw data" : "View raw data"}</button><button type="button" className="cc-confirmation-card__button--secondary" onClick={downloadPdf}>Download PDF</button></div>{showRaw ? <pre className="cc-migration-raw">{JSON.stringify(raw, null, 2)}</pre> : <article className="cc-chat-markdown cc-migration-report"><ReactMarkdown remarkPlugins={[remarkGfm]} allowedElements={ALLOWED_ELEMENTS} unwrapDisallowed>{report}</ReactMarkdown></article>}</>}
        </div>
      </section>
    </div>}
  </>;
}
