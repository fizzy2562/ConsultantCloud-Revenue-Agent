"use client";

import { useRef } from "react";

/** The agent's operating modes. Unchanged: these are what the chat API understands. */
export type Mode = "user" | "architect";

/** What the tab bar can show. "connection" is UI-only and never sent to the agent. */
export type Tab = Mode | "connection";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "user", label: "User" },
  { id: "architect", label: "Architect" },
  { id: "connection", label: "Connection" },
];

type ModeToggleProps = {
  tab: Tab;
  onChange: (tab: Tab) => void;
};

export function ModeToggle({ tab, onChange }: ModeToggleProps) {
  const refs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = TABS.findIndex((candidate) => candidate.id === tab);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(index + delta + TABS.length) % TABS.length]!.id;
    refs.current[next]?.focus();
    if (next !== tab) onChange(next);
  };

  const activeStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, #3d7fab, #51ac52)",
    color: "#ffffff",
  };

  const inactiveStyle: React.CSSProperties = {
    background: "transparent",
    color: "#6b7280",
  };

  const baseButtonStyle: React.CSSProperties = {
    borderRadius: "9999px",
    border: "none",
    padding: "6px 14px",
    fontSize: "0.8125rem",
    fontWeight: 500,
    cursor: "pointer",
    lineHeight: 1.4,
  };

  return (
    <div
      role="tablist"
      aria-label="Mode"
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "9999px",
        background: "#ffffff",
        padding: "4px",
        display: "inline-flex",
        gap: "4px",
      }}
    >
      {TABS.map((candidate) => (
        <button
          key={candidate.id}
          ref={(element) => {
            refs.current[candidate.id] = element;
          }}
          type="button"
          role="tab"
          aria-selected={tab === candidate.id}
          onClick={() => {
            if (tab !== candidate.id) onChange(candidate.id);
          }}
          onKeyDown={handleKeyDown}
          style={{ ...baseButtonStyle, ...(tab === candidate.id ? activeStyle : inactiveStyle) }}
        >
          {candidate.label}
        </button>
      ))}
    </div>
  );
}
