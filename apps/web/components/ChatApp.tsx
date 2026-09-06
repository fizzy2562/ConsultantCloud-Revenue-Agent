"use client";

import { useState } from "react";
import { ConfirmationCard } from "./ConfirmationCard";
import { ToolTracePanel } from "./ToolTracePanel";

type ChatTurn = { role: "user" | "assistant"; content: string };

type PendingConfirmation = {
  toolName: string;
  args: Record<string, unknown>;
  summary: { title: string; lines: string[]; confirmLabel: string; cancelLabel: string };
};

type RequestBody =
  | { kind: "message"; text: string; history: ChatTurn[] }
  | { kind: "confirm"; pending: PendingConfirmation; history: ChatTurn[] }
  | { kind: "cancel"; pending: PendingConfirmation; history: ChatTurn[] };

type AgentTraceEntry = {
  tool: string;
  badge: "READ" | "WRITE" | "GATE";
  durationMs: number;
  blocked: boolean;
  summary: string;
};

type AgentTurnResult = {
  message: string;
  trace: AgentTraceEntry[];
  pendingConfirmation: PendingConfirmation | null;
};

const starterPrompts = [
  "Renew Acme University for 3 years and increase Cloud Pro to 250 seats.",
  "Create an initial quote for Greenfield Health with 75 Cloud Pro seats.",
  "Give Acme University a 20% discount.",
  "Try to give Acme University a 30% discount.",
];

export function ChatApp() {
  const [messages, setMessages] = useState<Array<{ role: "user" | "agent"; text: string }>>([]);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [trace, setTrace] = useState<AgentTraceEntry[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [traceExpanded, setTraceExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");

  async function sendTurn(body: RequestBody) {
    setIsLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "agent", text: "Something went wrong reaching the agent. Please try again." },
        ]);
        return;
      }

      const result = (await res.json()) as AgentTurnResult;
      setMessages((prev) => [...prev, { role: "agent", text: result.message }]);
      setTrace((prev) => [...prev, ...result.trace]);
      setPendingConfirmation(result.pendingConfirmation);
      setHistory((prev) => [...prev, { role: "assistant", content: result.message }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: "Something went wrong reaching the agent. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSendText(text: string) {
    const trimmed = text.trim();
    if (isLoading || trimmed === "") return;

    const newHistory: ChatTurn[] = [...history, { role: "user", content: trimmed }];
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setHistory(newHistory);
    setInputValue("");
    sendTurn({ kind: "message", text: trimmed, history: newHistory });
  }

  function handleConfirm() {
    if (!pendingConfirmation) return;
    sendTurn({ kind: "confirm", pending: pendingConfirmation, history });
  }

  function handleCancel() {
    if (!pendingConfirmation) return;
    sendTurn({ kind: "cancel", pending: pendingConfirmation, history });
  }

  return (
    <>
      <header className="cc-header">
        <div>
          <img src="/consultantcloud-logo.svg" alt="ConsultantCloud" width={32} height={32} />
          <span>consultantcloud</span>
        </div>
        <div>
          <span>OPEN SOURCE LAB</span>
          <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
          <span>Built for Agentforce Revenue Management</span>
        </div>
      </header>

      <section className="cc-hero">
        <h1>Revenue work, without the paperwork.</h1>
        <p>A headless Agentforce demo that turns plain-English commercial requests into governed Revenue Management actions.</p>
        <span className="cc-hero-badge">ConsultantCloud Labs · Open Source</span>
      </section>

      <div className="cc-starter-prompts">
        {starterPrompts.map((prompt) => (
          <button key={prompt} type="button" onClick={() => handleSendText(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      <div className="cc-app-shell">
        <div className="cc-conversation-panel">
          <div className="cc-message-list">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`cc-chat-bubble cc-chat-bubble--${message.role === "user" ? "user" : "agent"}`}
              >
                {message.text}
              </div>
            ))}
            {isLoading && (
              <div className="cc-chat-bubble cc-chat-bubble--agent">Thinking…</div>
            )}
            {pendingConfirmation && (
              <ConfirmationCard
                data={pendingConfirmation.summary}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
              />
            )}
          </div>
          <div className="cc-input-area">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendText(inputValue);
              }}
              placeholder="Type a commercial request..."
              disabled={isLoading}
            />
            <button type="button" onClick={() => handleSendText(inputValue)} disabled={isLoading}>
              Send
            </button>
          </div>
        </div>
        <ToolTracePanel
          entries={trace}
          expanded={traceExpanded}
          onToggle={() => setTraceExpanded((v) => !v)}
        />
      </div>
    </>
  );
}
