"use client";

import { useRef } from "react";

export type Mode = "user" | "architect";

type ModeToggleProps = {
  mode: Mode;
  onChange: (mode: Mode) => void;
};

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  const userRef = useRef<HTMLButtonElement>(null);
  const architectRef = useRef<HTMLButtonElement>(null);

  const focusTab = (target: Mode) => {
    if (target === "user") {
      userRef.current?.focus();
    } else {
      architectRef.current?.focus();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const next: Mode = mode === "user" ? "architect" : "user";
    focusTab(next);
    if (next !== mode) {
      onChange(next);
    }
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
      <button
        ref={userRef}
        type="button"
        role="tab"
        aria-selected={mode === "user"}
        onClick={() => {
          if (mode !== "user") {
            onChange("user");
          }
        }}
        onKeyDown={handleKeyDown}
        onMouseEnter={(e) => {
          if (mode !== "user") {
            e.currentTarget.style.color = "#1f2937";
          }
        }}
        onMouseLeave={(e) => {
          if (mode !== "user") {
            e.currentTarget.style.color = "#6b7280";
          }
        }}
        style={{
          ...baseButtonStyle,
          ...(mode === "user" ? activeStyle : inactiveStyle),
        }}
      >
        User
      </button>
      <button
        ref={architectRef}
        type="button"
        role="tab"
        aria-selected={mode === "architect"}
        onClick={() => {
          if (mode !== "architect") {
            onChange("architect");
          }
        }}
        onKeyDown={handleKeyDown}
        onMouseEnter={(e) => {
          if (mode !== "architect") {
            e.currentTarget.style.color = "#1f2937";
          }
        }}
        onMouseLeave={(e) => {
          if (mode !== "architect") {
            e.currentTarget.style.color = "#6b7280";
          }
        }}
        style={{
          ...baseButtonStyle,
          ...(mode === "architect" ? activeStyle : inactiveStyle),
        }}
      >
        Architect
      </button>
    </div>
  );
}
