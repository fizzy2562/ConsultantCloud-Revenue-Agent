"use client";

type TraceEntry = {
  tool: string;
  badge: "READ" | "WRITE" | "GATE";
  durationMs: number;
  blocked: boolean;
  summary: string;
};

export function ToolTracePanel({
  runId,
  entries,
  expanded,
  onToggle,
}: {
  runId: string;
  entries: TraceEntry[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`cc-trace-panel ${expanded ? "cc-trace-panel--expanded" : "cc-trace-panel--collapsed"}`}
    >
      <div className="cc-trace-controls">
        <button
          type="button"
          className="cc-trace-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls="cc-trace-entries-region"
        >
          {expanded ? "Hide trace" : "Show trace"}
        </button>
        <a
          className="cc-trace-download"
          href={`/api/runs/${runId}/trace`}
          download={`trace-${runId}.json`}
        >
          Download trace
        </a>
      </div>
      <div className="cc-trace-entries" id="cc-trace-entries-region">
        {entries.length === 0 && (
          <p className="cc-trace-empty">Tool calls will appear here after the agent responds.</p>
        )}
        {entries.map((entry, index) => (
          <div className="cc-trace-entry" key={index}>
            <span className={`cc-badge-${entry.badge.toLowerCase()}`}>
              {entry.badge}
            </span>
            {entry.blocked && (
              <span className="cc-trace-blocked">blocked</span>
            )}
            <span className="cc-trace-tool-name">{entry.tool}</span>
            <span className="cc-trace-summary">{entry.summary}</span>
            <span className="cc-trace-duration">{entry.durationMs}ms</span>
          </div>
        ))}
      </div>
    </div>
  );
}
