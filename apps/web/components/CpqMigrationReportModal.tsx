"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type QueryResponse = { raw?: unknown; error?: unknown };
type SynthesizeResponse = { report?: unknown; error?: unknown; truncated?: unknown };
type Status = "idle" | "querying" | "synthesizing" | "done" | "error";
const ALLOWED_ELEMENTS = ["h1", "h2", "h3", "p", "strong", "em", "ul", "ol", "li", "code", "br", "table", "thead", "tbody", "tr", "th", "td"];

export function CpqMigrationReportModal() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [report, setReport] = useState("");
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

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
      setReport(synthesizeBody.report); setTruncated(synthesizeBody.truncated === true); setStatus("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The report request could not be completed"); setStatus("error");
    }
  }

  async function copyReport() {
    try { await navigator.clipboard.writeText(report); setCopied(true); } catch { setCopied(false); }
  }

  return <>
    <button type="button" className="cc-migration-trigger" disabled={status === "querying" || status === "synthesizing"} onClick={() => setOpen(true)}>Generate CPQ Migration Report</button>
    {open && <div className="cc-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="cc-modal" role="dialog" aria-modal="true" aria-labelledby="cc-migration-title">
        <header className="cc-modal__header"><div><span className="cc-badge-read">READ-ONLY ANALYSIS</span><h2 id="cc-migration-title">CPQ Migration Report</h2></div><button ref={closeRef} type="button" className="cc-modal__close" aria-label="Close migration report" onClick={() => setOpen(false)}>×</button></header>
        <div className="cc-modal__body">
          {status === "idle" && <><p>Analyzes your connected CPQ org&apos;s Price Rules, Discount Schedules, Product Rules, Custom Scripts, catalog structure, and Twin Fields, and proposes how each maps to Revenue Cloud.</p><button type="button" className="cc-confirmation-card__button--primary" onClick={runAnalysis}>Run Analysis</button></>}
          {status === "querying" && <div className="cc-migration-running" role="status"><span className="cc-spinner" aria-hidden="true" />Querying CPQ org — Price Rules, Discount Schedules, Product Rules, Custom Scripts, catalog structure, Twin Fields...</div>}
          {status === "synthesizing" && <div className="cc-migration-running" role="status"><span className="cc-spinner" aria-hidden="true" />CPQ data gathered. Generating the report now — this can take a few minutes for a full analysis.</div>}
          {status === "error" && <div role="alert" className="cc-migration-error"><strong>Analysis failed:</strong> {error}<div><button type="button" className="cc-confirmation-card__button--primary" onClick={runAnalysis}>Try Again</button></div></div>}
          {status === "done" && <>{truncated && <div className="cc-migration-truncated-warning" role="alert">This report was cut off before it finished — the underlying model hit its output limit. Treat the last section with caution, or click &quot;Try Again&quot; below to regenerate.</div>}<div className="cc-modal__actions"><button type="button" className="cc-confirmation-card__button--secondary" onClick={copyReport}>{copied ? "Copied" : "Copy report as Markdown"}</button><button type="button" className="cc-confirmation-card__button--secondary" aria-expanded={showRaw} onClick={() => setShowRaw((value) => !value)}>{showRaw ? "Hide raw data" : "View raw data"}</button>{truncated && <button type="button" className="cc-confirmation-card__button--secondary" onClick={runAnalysis}>Try Again</button>}</div>{showRaw ? <pre className="cc-migration-raw">{JSON.stringify(raw, null, 2)}</pre> : <article className="cc-chat-markdown cc-migration-report"><ReactMarkdown remarkPlugins={[remarkGfm]} allowedElements={ALLOWED_ELEMENTS} unwrapDisallowed>{report}</ReactMarkdown></article>}</>}
        </div>
      </section>
    </div>}
  </>;
}
