"use client";

type TraceEntry = {
  tool: string;
  badge: "READ" | "WRITE" | "GATE";
  durationMs: number;
  blocked: boolean;
  summary: string;
};

export function ToolTracePanel({
  entries,
  expanded,
  onToggle,
}: {
  entries: TraceEntry[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`cc-trace-panel ${expanded ? "cc-trace-panel--expanded" : "cc-trace-panel--collapsed"}`}
    >
      <button type="button" className="cc-trace-toggle" onClick={onToggle}>
        {expanded ? "Hide trace" : "Show trace"}
      </button>
      <div className="cc-trace-entries">
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
