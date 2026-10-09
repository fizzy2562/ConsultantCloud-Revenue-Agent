"use client";

import { useEffect, useState } from "react";
import { clearModelKey, maskKey, readModelKey, saveModelKey } from "../lib/modelKey";

type Target = "revenue" | "cpq";
type Identity = { username: string; orgId: string; displayName: string };
type Status =
  | { state: "loading" }
  | { state: "connected"; instanceUrl: string; identity: Identity }
  | { state: "disconnected"; oauthConfigured: boolean; message?: string };

const PANEL: React.CSSProperties = {
  border: "1px solid var(--cc-line)",
  borderRadius: 12,
  padding: "1.5rem",
  background: "#ffffff",
};
const PRIMARY: React.CSSProperties = {
  display: "inline-block",
  padding: "0.65rem 1.3rem",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "0.95rem",
  textDecoration: "none",
  background: "var(--cc-grad)",
  color: "#ffffff",
};

/** One OAuth connection per org: the Revenue Cloud org, and the CPQ org the migration report reads. */
export function ConnectionPanel() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(new URLSearchParams(window.location.search).get("error")), []);
  return (
    <div style={{ display: "grid", gap: "1.25rem", maxWidth: 560, margin: "0 auto" }}>
      {error && <p style={{ fontSize: "0.85rem", color: "var(--cc-danger-text)", margin: 0 }}>Sign-in failed: {error}</p>}
      <ModelKeyCard />
      <ConnectionCard target="revenue" title="Revenue Cloud org" blurb="The org the agent quotes, prices and configures against." />
      <ConnectionCard target="cpq" title="CPQ source org" blurb="The legacy Salesforce CPQ org the migration report inspects." />
    </div>
  );
}

function ConnectionCard({ target, title, blurb }: { target: Target; title: string; blurb: string }) {
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/auth/session?target=${target}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((body) =>
        setStatus(
          body.connected
            ? { state: "connected", instanceUrl: body.instanceUrl, identity: body.identity }
            : { state: "disconnected", oauthConfigured: Boolean(body.oauthConfigured), message: body.error }
        )
      )
      .catch(() => setStatus({ state: "disconnected", oauthConfigured: true, message: "Could not check the connection." }));
  }, [target]);

  async function signOut() {
    setBusy(true);
    await fetch(`/api/auth/session?target=${target}`, { method: "DELETE" });
    setStatus({ state: "disconnected", oauthConfigured: true });
    setBusy(false);
  }

  if (status.state === "loading") return <div style={PANEL}>Checking {title}…</div>;

  if (status.state === "connected") {
    return (
      <div style={PANEL}>
        <h2 style={{ marginTop: 0 }}>✓ {title}</h2>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.4rem 1rem", fontSize: "0.9rem" }}>
          <dt style={{ fontWeight: 600 }}>User</dt>
          <dd style={{ margin: 0 }}>
            {status.identity.displayName} · {status.identity.username}
          </dd>
          <dt style={{ fontWeight: 600 }}>Org</dt>
          <dd style={{ margin: 0 }}>{status.identity.orgId}</dd>
          <dt style={{ fontWeight: 600 }}>Instance</dt>
          <dd style={{ margin: 0 }}>{status.instanceUrl}</dd>
        </dl>
        <p style={{ fontSize: "0.85rem", opacity: 0.8 }}>{blurb}</p>
        <button
          type="button"
          style={{ ...PRIMARY, background: "#ffffff", color: "var(--cc-ink)", border: "1px solid var(--cc-control)", fontWeight: 500 }}
          onClick={signOut}
          disabled={busy}
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div style={PANEL}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ fontSize: "0.9rem", opacity: 0.85 }}>{blurb} You&apos;ll log in on Salesforce and come straight back.</p>
      {status.message && <p style={{ fontSize: "0.85rem", color: "var(--cc-danger-text)" }}>{status.message}</p>}
      {status.oauthConfigured ? (
        <a href={`/api/auth/login?target=${target}`} style={PRIMARY}>
          Sign in with Salesforce
        </a>
      ) : (
        <p style={{ fontSize: "0.85rem", color: "var(--cc-warn-text)" }}>OAuth isn&apos;t configured for this connection on this deployment.</p>
      )}
    </div>
  );
}

const FIELD: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 42,
  padding: "10px 14px",
  border: "1px solid var(--cc-control)",
  borderRadius: 8,
  font: "inherit",
  color: "var(--cc-ink)",
  background: "#ffffff",
};

/** Bring your own key: use the visitor's own model API key instead of the demo's free model. */
function ModelKeyCard() {
  const [saved, setSaved] = useState<{ apiKey: string; model: string } | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  useEffect(() => setSaved(readModelKey()), []);

  if (saved) {
    return (
      <div style={PANEL}>
        <h2 style={{ marginTop: 0 }}>✓ AI model: your own key</h2>
        <p style={{ fontSize: "0.9rem", opacity: 0.85 }}>
          Chats use your key ({maskKey(saved.apiKey)}) with {saved.model ? <code>{saved.model}</code> : "the default model"}. It stays in
          this browser tab only and is forgotten when you close it.
        </p>
        <button
          type="button"
          style={{ ...PRIMARY, background: "#ffffff", color: "var(--cc-ink)", border: "1px solid var(--cc-control)", fontWeight: 500 }}
          onClick={() => {
            clearModelKey();
            setSaved(null);
          }}
        >
          Remove my key
        </button>
      </div>
    );
  }

  return (
    <div style={PANEL}>
      <h2 style={{ marginTop: 0 }}>AI model</h2>
      <p style={{ fontSize: "0.9rem", opacity: 0.85 }}>
        Chats use this deployment&apos;s model, which on a public demo is usually a free one with shared daily limits. To use your own{" "}
        <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: "var(--cc-green-text)" }}>
          OpenRouter key
        </a>{" "}
        instead, add it here. It stays in this browser tab, is sent only with your chat requests, and is never stored on the server.
      </p>
      <form
        style={{ display: "grid", gap: "0.75rem" }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!apiKey.trim()) return;
          saveModelKey(apiKey, model);
          setSaved(readModelKey());
          setApiKey("");
        }}
      >
        <label style={{ display: "grid", gap: 6, fontSize: "0.875rem", color: "var(--cc-body)" }}>
          API key
          <input type="password" autoComplete="off" spellCheck={false} placeholder="sk-or-…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={FIELD} />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: "0.875rem", color: "var(--cc-body)" }}>
          Model (optional)
          <input type="text" autoComplete="off" spellCheck={false} placeholder="deepseek/deepseek-v4-flash-0731" value={model} onChange={(e) => setModel(e.target.value)} style={FIELD} />
        </label>
        <div>
          <button type="submit" style={PRIMARY} disabled={!apiKey.trim()}>
            Use my key
          </button>
        </div>
      </form>
    </div>
  );
}
