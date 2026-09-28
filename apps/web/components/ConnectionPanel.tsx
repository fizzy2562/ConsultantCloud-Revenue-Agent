"use client";

import { useEffect, useState } from "react";

type Target = "revenue" | "cpq";
type Identity = { username: string; orgId: string; displayName: string };
type Status =
  | { state: "loading" }
  | { state: "connected"; instanceUrl: string; identity: Identity }
  | { state: "disconnected"; oauthConfigured: boolean; message?: string };

const PANEL: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 12,
  padding: "1.5rem",
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
  background: "linear-gradient(135deg, #0176d3, #1b96ff)",
  color: "#ffffff",
};

/** One OAuth connection per org: the Revenue Cloud org, and the CPQ org the migration report reads. */
export function ConnectionPanel() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(new URLSearchParams(window.location.search).get("error")), []);
  return (
    <div style={{ display: "grid", gap: "1.25rem", maxWidth: 560, margin: "0 auto" }}>
      {error && <p style={{ fontSize: "0.85rem", color: "#b91c1c", margin: 0 }}>Sign-in failed: {error}</p>}
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
        <button type="button" style={{ ...PRIMARY, background: "#64748b" }} onClick={signOut} disabled={busy}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div style={PANEL}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ fontSize: "0.9rem", opacity: 0.85 }}>{blurb} You&apos;ll log in on Salesforce and come straight back.</p>
      {status.message && <p style={{ fontSize: "0.85rem", color: "#b91c1c" }}>{status.message}</p>}
      {status.oauthConfigured ? (
        <a href={`/api/auth/login?target=${target}`} style={PRIMARY}>
          Sign in with Salesforce
        </a>
      ) : (
        <p style={{ fontSize: "0.85rem", color: "#b45309" }}>OAuth isn&apos;t configured for this connection on this deployment.</p>
      )}
    </div>
  );
}
