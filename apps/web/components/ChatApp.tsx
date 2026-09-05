"use client";

import { useState } from "react";
import {
  conversationFlows,
  type ConversationFlow,
  type ChatMessage,
} from "../lib/mockConversation";
import { ConfirmationCard } from "./ConfirmationCard";
import { ToolTracePanel } from "./ToolTracePanel";

export function ChatApp() {
  const [activeFlow, setActiveFlow] = useState<ConversationFlow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [confirmationResolved, setConfirmationResolved] = useState(false);
  const [traceExpanded, setTraceExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");

  function startFlow(flow: ConversationFlow) {
    setActiveFlow(flow);
    setMessages([...flow.messages]);
    setConfirmationResolved(false);
  }

  function handleSubmitInput() {
    const trimmed = inputValue.trim();
    const matched = conversationFlows.find((flow) => flow.starterPrompt === trimmed);
    if (matched) {
      startFlow(matched);
    } else {
      setMessages((prev) => [
        ...prev,
        { role: "user", text: trimmed },
        {
          role: "agent",
          text: "I don't have a scripted response for that in this demo — try one of the starter prompts above.",
        },
      ]);
    }
    setInputValue("");
  }

  function handleConfirm() {
    setConfirmationResolved(true);
    if (activeFlow?.afterConfirmMessage) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: activeFlow.afterConfirmMessage as string },
      ]);
    }
  }

  function handleCancel() {
    setConfirmationResolved(true);
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
        {conversationFlows.map((flow) => (
          <button key={flow.id} type="button" onClick={() => startFlow(flow)}>
            {flow.starterPrompt}
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
            {activeFlow?.confirmation && !confirmationResolved && (
              <ConfirmationCard
                data={activeFlow.confirmation}
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
                if (e.key === "Enter") handleSubmitInput();
              }}
              placeholder="Type a commercial request..."
            />
            <button type="button" onClick={handleSubmitInput}>Send</button>
          </div>
        </div>
        <ToolTracePanel
          entries={activeFlow?.trace ?? []}
          expanded={traceExpanded}
          onToggle={() => setTraceExpanded((v) => !v)}
        />
      </div>
    </>
  );
}
