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
      <DemoDataCard />
      <OrgChecksCard />
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

type DemoStep = { step: string; status: "done" | "already there" | "pending" | "failed"; detail: string };
const STEP_COLOUR: Record<DemoStep["status"], string> = {
  done: "var(--cc-green-text)",
  "already there": "var(--cc-body)",
  pending: "var(--cc-warn-text)",
  failed: "var(--cc-danger-text)",
};

/** Creates the records the User-mode demo needs in the connected Revenue Cloud org. */
function DemoDataCard() {
  const [org, setOrg] = useState<{ available: boolean; instanceUrl?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<DemoStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastAction, setLastAction] = useState<"set up" | "reset">("set up");
  useEffect(() => {
    fetch("/api/demo-data", { cache: "no-store" })
      .then((response) => response.json())
      .then(setOrg)
      .catch(() => setOrg({ available: false }));
  }, []);

  async function run(method: "POST" | "DELETE" = "POST") {
    setBusy(true);
    setError(null);
    setSteps(null);
    setConfirmingReset(false);
    setLastAction(method === "POST" ? "set up" : "reset");
    try {
      const response = await fetch("/api/demo-data", { method });
      const body = (await response.json()) as { steps?: DemoStep[]; error?: string };
      if (body.steps) setSteps(body.steps);
      else setError(body.error ?? "Setup failed.");
    } catch {
      setError("Couldn't reach the app. Is it still running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={PANEL}>
      <h2 style={{ marginTop: 0 }}>Demo data</h2>
      <p style={{ fontSize: "0.9rem", opacity: 0.85 }}>
        Sets up what the User-mode demo needs in the connected Revenue Cloud org: Acme University and Greenfield Health, the
        Cloud products with prices Revenue Cloud can quote, Acme&apos;s current Cloud Pro subscription (so there&apos;s something to
        renew) and an open Acme quote (so there&apos;s something to discount). Safe to run again: it only adds what&apos;s missing.
      </p>
      {org && !org.available && (
        <p style={{ fontSize: "0.85rem", color: "var(--cc-warn-text)" }}>Sign in to a Revenue Cloud org above first. Without one, the app uses its built-in demo data.</p>
      )}
      {org?.available && (
        <>
          <p style={{ fontSize: "0.85rem", color: "var(--cc-muted)" }}>Org: {org.instanceUrl}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" style={PRIMARY} onClick={() => run("POST")} disabled={busy}>
              {busy && lastAction === "set up" ? "Setting up… (up to 2 minutes)" : "Set up demo data"}
            </button>
            <button
              type="button"
              style={{ ...PRIMARY, background: "#ffffff", color: "var(--cc-danger-text)", border: "1px solid var(--cc-danger-line)", fontWeight: 500 }}
              onClick={() => setConfirmingReset(true)}
              disabled={busy}
            >
              {busy && lastAction === "reset" ? "Resetting… (up to 2 minutes)" : "Reset demo"}
            </button>
          </div>
          {confirmingReset && (
            <div role="alert" style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "var(--cc-warn-bg)", color: "var(--cc-warn-text)", fontSize: "0.875rem", display: "grid", gap: 10 }}>
              <span>
                Reset deletes every quote and order on Acme University and Greenfield Health, and cancels their subscriptions as of today.
                Nothing else in the org is touched. Then click Set up demo data to rebuild them.
              </span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" style={{ ...PRIMARY, background: "var(--cc-danger-text)" }} onClick={() => run("DELETE")}>
                  Yes, reset the demo accounts
                </button>
                <button type="button" style={{ ...PRIMARY, background: "#ffffff", color: "var(--cc-ink)", border: "1px solid var(--cc-control)", fontWeight: 500 }} onClick={() => setConfirmingReset(false)}>
                  Keep them
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {error && <p style={{ fontSize: "0.85rem", color: "var(--cc-danger-text)" }}>{error}</p>}
      {steps && (
        <ul style={{ listStyle: "none", padding: 0, margin: "1rem 0 0", display: "grid", gap: 8, fontSize: "0.875rem" }}>
          {steps.map((s) => (
            <li key={s.step}>
              <strong style={{ color: STEP_COLOUR[s.status] }}>{s.status === "already there" ? "✓ already there" : s.status === "done" ? "✓ done" : s.status === "pending" ? "… pending" : "✗ failed"}</strong>{" "}
              {s.step}
              <div style={{ color: "var(--cc-muted)", overflowWrap: "anywhere" }}>{s.detail}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type OrgCheck = { name: string; ok: boolean; detail: string };

/** Runs the org checks (the same ones as `pnpm test:org`) and shows each result. */
function OrgChecksCard() {
  const [availability, setAvailability] = useState<{ available: boolean; reason?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<OrgCheck[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/org-checks", { cache: "no-store" })
      .then((response) => response.json())
      .then(setAvailability)
      .catch(() => setAvailability({ available: false, reason: "Couldn't reach the app." }));
  }, []);

  async function run() {
    setBusy(true);
    setChecks(null);
    setError(null);
    try {
      const body = (await (await fetch("/api/org-checks", { method: "POST" })).json()) as { checks?: OrgCheck[]; error?: string };
      if (body.checks) setChecks(body.checks);
      else setError(body.error ?? "The checks failed to run.");
    } catch {
      setError("Couldn't reach the app. Is it still running?");
    } finally {
      setBusy(false);
    }
  }

  if (!availability) return null;
  const passed = checks?.filter((c) => c.ok).length ?? 0;
  return (
    <div style={PANEL}>
      <h2 style={{ marginTop: 0 }}>Org checks</h2>
      <p style={{ fontSize: "0.9rem", opacity: 0.85 }}>
        Checks the whole flow against this org, the same checks as <code>pnpm test:org</code>: the demo data, pricing, the &quot;why&quot; tools, and the
        chat refusing a 30% discount and applying a 20% one with an approver (on the demo expansion quote), then reads the new price back from Salesforce.
        Takes about a minute.
      </p>
      {!availability.available && <p style={{ fontSize: "0.85rem", color: "var(--cc-warn-text)" }}>{availability.reason}</p>}
      {availability.available && (
        <button type="button" style={PRIMARY} onClick={run} disabled={busy}>
          {busy ? "Running checks… (about a minute)" : "Run org checks"}
        </button>
      )}
      {error && <p style={{ fontSize: "0.85rem", color: "var(--cc-danger-text)" }}>{error}</p>}
      {checks && (
        <>
          <p data-testid="org-checks-summary" style={{ margin: "1rem 0 0.5rem", fontWeight: 600, color: passed === checks.length ? "var(--cc-green-text)" : "var(--cc-danger-text)" }}>
            {passed} of {checks.length} passed
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8, fontSize: "0.875rem" }}>
            {checks.map((c) => (
              <li key={c.name}>
                <strong style={{ color: c.ok ? "var(--cc-green-text)" : "var(--cc-danger-text)" }}>{c.ok ? "✓ pass" : "✗ fail"}</strong> {c.name}
                {c.detail && <div style={{ color: "var(--cc-muted)", overflowWrap: "anywhere" }}>{c.detail}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
