"use client";

import type { TraceEntry } from "../lib/mockConversation";

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
    <>
      <button type="button" onClick={onToggle}>
        {expanded ? "Hide trace" : "Show trace"}
      </button>
      <div
        className={`cc-trace-panel ${expanded ? "cc-trace-panel--expanded" : "cc-trace-panel--collapsed"}`}
      >
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
    </>
  );
}
