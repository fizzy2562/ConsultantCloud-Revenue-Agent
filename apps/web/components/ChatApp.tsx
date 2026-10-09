"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ConfirmationCard } from "./ConfirmationCard";
import { ToolTracePanel } from "./ToolTracePanel";
import { ModeToggle, type Mode, type Tab } from "./ModeToggle";
import { ConnectionPanel } from "./ConnectionPanel";
import { ArchitectDashboard } from "./ArchitectDashboard";
import { CpqMigrationReportModal } from "./CpqMigrationReportModal";

type ChatTurn = { role: "user" | "assistant"; content: string };

type PendingConfirmation = {
  toolName: string;
  args: Record<string, unknown>;
  summary: { title: string; lines: string[]; confirmLabel: string; cancelLabel: string; requiresApproverName?: boolean };
};

type RequestBody =
  | { kind: "message"; text: string; history: ChatTurn[]; mode: Mode }
  | { kind: "confirm"; pending: PendingConfirmation; history: ChatTurn[]; approverName?: string; mode: Mode }
  | { kind: "cancel"; pending: PendingConfirmation; history: ChatTurn[]; mode: Mode };

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

const starterPromptsByMode: Record<Mode, Array<{ label: string; prompt: string }>> = {
  user: [
    { label: "Renewal", prompt: "Renew Acme University for 3 years and increase Cloud Pro to 250 seats." },
    { label: "New quote", prompt: "Create an initial quote for Greenfield Health with 75 Cloud Pro seats." },
    { label: "Approval", prompt: "Give Acme University a 20% discount." },
    { label: "Policy rejection", prompt: "Try to give Acme University a 30% discount." },
  ],
  architect: [
    { label: "Search catalog", prompt: "Find products with 'Laptop' in the name." },
    { label: "Price a product", prompt: "Set the price of the Printer Bundle to $499 on the standard price book." },
    { label: "Inspect a bundle", prompt: "Show me the component structure of the Laptop Pro Bundle." },
    { label: "Add a component", prompt: "Add Warranty as a component of the Laptop Basic Bundle." },
  ],
};

const heroCopyByMode: Record<Mode, { title: string; body: string }> = {
  user: {
    title: "Revenue work, without the paperwork.",
    body: "A headless Agentforce demo that turns plain-English commercial requests into governed Revenue Management actions.",
  },
  architect: {
    title: "Manage the catalog, from the agent.",
    body: "Create and update products, set pricing, and shape bundle structure — every change reviewed before it runs.",
  },
};

export function ChatApp() {
  const [tab, setTab] = useState<Tab>("user");
  // After the Salesforce OAuth round trip the callback lands on ?tab=connection.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "connection") setTab("connection");
  }, []);
  // "connection" is a UI-only tab; the agent still runs in the last real mode.
  const mode: Mode = tab === "connection" ? "user" : tab;
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "agent"; text: string }>>([]);
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [trace, setTrace] = useState<AgentTraceEntry[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [traceExpanded, setTraceExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [pendingActionLabel, setPendingActionLabel] = useState<string>("Thinking…");

  const sendInFlightRef = useRef<boolean>(false);
  const messageListEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setConversationId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    messageListEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pendingConfirmation]);

  async function sendTurn(body: RequestBody) {
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setIsLoading(true);
    setPendingActionLabel(
      body.kind === "confirm"
        ? "Submitting your confirmation…"
        : body.kind === "cancel"
          ? "Cancelling proposal…"
          : "Thinking…"
    );
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, conversationId }),
      });

      if (!res.ok) {
        // A setup problem (503) explains itself; anything else is worth a retry.
        const reason = res.status === 503 ? ((await res.json().catch(() => null)) as { error?: string } | null)?.error : undefined;
        setMessages((prev) => [
          ...prev,
          { role: "agent", text: reason ?? "Something went wrong reaching the agent. Please try again." },
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
      sendInFlightRef.current = false;
    }
  }

  function handleSendText(text: string) {
    const trimmed = text.trim();
    if (isLoading || trimmed === "") return;

    const newHistory: ChatTurn[] = [...history, { role: "user", content: trimmed }];
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setHistory(newHistory);
    setInputValue("");
    sendTurn({ kind: "message", text: trimmed, history: newHistory, mode });
  }

  function handleConfirm(approverName?: string) {
    if (!pendingConfirmation) return;
    sendTurn({ kind: "confirm", pending: pendingConfirmation, history, mode, ...(approverName ? { approverName } : {}) });
  }

  function handleCancel() {
    if (!pendingConfirmation) return;
    sendTurn({ kind: "cancel", pending: pendingConfirmation, history, mode });
  }

  function handleNewConversation() {
    setMessages([]);
    setHistory([]);
    setTrace([]);
    setPendingConfirmation(null);
    setInputValue("");
    setConversationId(crypto.randomUUID());
  }

  function handleModeChange(next: Tab) {
    if (next === tab) return;
    setTab(next);
    // Switching to the connection tab must not discard an in-progress conversation.
    if (next !== "connection") handleNewConversation();
  }

  const showEmptyState = messages.length === 0 && !isLoading && !pendingConfirmation;
  const starterPrompts = starterPromptsByMode[mode];
  const hero = heroCopyByMode[mode];

  return (
    <>
      <header className="cc-header">
        <div>
          <img src="/consultantcloud-logo.png" alt="Consultant Cloud" width={127} height={32} />
        </div>
        <div>
          <ModeToggle tab={tab} onChange={handleModeChange} />
          <span>OPEN SOURCE LAB</span>
          <a href="https://github.com/fizzy2562/ConsultantCloud-Revenue-Agent" target="_blank" rel="noreferrer">GitHub</a>
          <span>Built for Agentforce Revenue Management</span>
          {tab === "user" && (
            <button type="button" className="cc-new-conversation" onClick={handleNewConversation}>
              New conversation
            </button>
          )}
        </div>
      </header>

      {tab === "architect" && (
        <div
          style={{
            background: "var(--cc-warn-bg)",
            borderBottom: "1px solid var(--cc-warn-line)",
            color: "var(--cc-warn-text)",
            fontSize: "0.8125rem",
            padding: "8px 24px",
            textAlign: "center",
          }}
        >
          Internal demo — architect mode is not yet access-gated.
        </div>
      )}

      {tab === "connection" ? (
        <main style={{ padding: "24px" }}>
          <ConnectionPanel />
        </main>
      ) : (
      <main>
        <section className="cc-hero">
          <h1>{hero.title}</h1>
          <p>{hero.body}</p>
          <span className="cc-hero-badge">ConsultantCloud Labs · Open Source</span>
          {mode === "architect" && <CpqMigrationReportModal />}
        </section>

        <div className="cc-starter-prompts">
          {starterPrompts.map((item) => (
            <button
              key={item.prompt}
              type="button"
              onClick={() => handleSendText(item.prompt)}
              disabled={isLoading}
              title={item.label}
              aria-label={`${item.label}: ${item.prompt}`}
            >
              <span className="cc-sr-only">{item.label}: </span>
              {item.prompt}
            </button>
          ))}
        </div>

        <div className="cc-app-shell">
          <div className="cc-conversation-panel">
            <div className="cc-message-list">
              {showEmptyState && (
                <div className="cc-empty-state">
                  {mode === "user"
                    ? "Describe a commercial request below. Review each proposed change before it runs."
                    : "Describe a catalog change below. Review each proposed change before it runs."}
                </div>
              )}
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`cc-chat-bubble cc-chat-bubble--${message.role === "user" ? "user" : "agent"}`}
                >
                  <span className="cc-sr-only">{message.role === "user" ? "You said: " : "Agent said: "}</span>
                  {message.role === "agent" ? (
                    <div className="cc-chat-markdown">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        allowedElements={["p", "strong", "em", "ul", "ol", "li", "code", "br", "table", "thead", "tbody", "tr", "th", "td"]}
                        unwrapDisallowed
                      >
                        {message.text}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    message.text
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="cc-chat-bubble cc-chat-bubble--agent">
                  <span className="cc-sr-only">Agent said: </span>
                  {pendingActionLabel}
                </div>
              )}
              {pendingConfirmation && (
                <ConfirmationCard
                  key={pendingConfirmation.toolName + JSON.stringify(pendingConfirmation.args)}
                  data={pendingConfirmation.summary}
                  busy={isLoading}
                  onConfirm={handleConfirm}
                  onCancel={handleCancel}
                />
              )}
              <div ref={messageListEndRef} />
            </div>
            <div className="cc-input-area">
              <label htmlFor="cc-message-input" className="cc-sr-only">Message</label>
              <input
                id="cc-message-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendText(inputValue);
                }}
                placeholder={mode === "user" ? "Type a commercial request..." : "Type a catalog request..."}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => handleSendText(inputValue)}
                disabled={isLoading || inputValue.trim() === ""}
              >
                Send
              </button>
            </div>
          </div>
          <ToolTracePanel
            runId={conversationId}
            entries={trace}
            expanded={traceExpanded}
            onToggle={() => setTraceExpanded((v) => !v)}
          />
        </div>

        {mode === "architect" && <ArchitectDashboard />}
      </main>
      )}
    </>
  );
}
