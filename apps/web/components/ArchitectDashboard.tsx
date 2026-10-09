"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

type ArchitectureSnapshot = {
  schemaVersion: number;
  generatedAt: string;
  application: { name: string; apiRoutes: string[] };
  agentRuntime: {
    model: string;
    apiHost: string;
    toolLoopLimit: number;
    confirmationRequired: boolean;
  };
  gateway: { mode: "salesforce" | "mock"; reason: string };
  tools: Array<{
    name: string;
    title: string;
    description: string;
    kind: "read" | "write";
    confirmationRequired: boolean;
    inputSchema: unknown;
  }>;
  policies: {
    discountBands: unknown[];
    protectedMutations: string[];
    resilience: { wired: boolean; retry: unknown; circuitBreaker: unknown };
  };
  salesforce: { objects: string[]; flowActions: string[] };
  agentforce: { operationIds: string[]; deploymentStatus: string };
  observability: { traceStore: string; durable: boolean };
  warnings: string[];
};

const FONT_STACK =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const CARD_STYLE: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid var(--cc-border)",
  borderRadius: 12,
  padding: 20,
};

const SECTION_HEADING_STYLE: React.CSSProperties = {
  fontSize: "0.9375rem",
  fontWeight: 600,
  color: "var(--cc-ink)",
  marginBottom: 12,
};

const MUTED_STYLE: React.CSSProperties = { color: "var(--cc-muted)" };

const PILL_BASE: React.CSSProperties = {
  borderRadius: 50,
  padding: "2px 10px",
  fontSize: "0.75rem",
  fontWeight: 600,
  display: "inline-block",
  whiteSpace: "nowrap",
};

const READ_PILL: React.CSSProperties = { ...PILL_BASE, background: "var(--cc-fill)", color: "var(--cc-body)" };
const WRITE_PILL: React.CSSProperties = { ...PILL_BASE, background: "var(--cc-warn-bg)", color: "var(--cc-warn-text)" };
const STATUS_PILL: React.CSSProperties = { ...PILL_BASE, background: "var(--cc-fill)", color: "var(--cc-ink)" };

const WARNING_BANNER_STYLE: React.CSSProperties = {
  background: "var(--cc-warn-bg)",
  border: "1px solid var(--cc-warn-line)",
  color: "var(--cc-warn-text)",
  borderRadius: 8,
  padding: "10px 12px",
};

const GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
};

const TABLE_STYLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const TH_STYLE: React.CSSProperties = {
  background: "var(--cc-fill)",
  fontSize: "0.8125rem",
  padding: "10px 12px",
  textAlign: "left",
  borderBottom: "1px solid var(--cc-line)",
};

const TD_STYLE: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--cc-line)",
  verticalAlign: "top",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ ...MUTED_STYLE, fontSize: "0.8125rem", marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: "0.875rem" }}>None</div>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ ...MUTED_STYLE, fontSize: "0.8125rem", marginBottom: 4 }}>{label}</div>
      <ul className="cc-architecture-list" style={{ margin: 0, paddingLeft: 18, fontSize: "0.875rem", lineHeight: 1.5 }}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="cc-architecture-field" style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8, fontSize: "0.875rem" }}>
      <span style={{ ...MUTED_STYLE, flexShrink: 0 }}>{label}</span>
      <span style={{ textAlign: "right", overflowWrap: "anywhere", minWidth: 0 }}>{value}</span>
    </div>
  );
}

function DiscountBandItem({ item }: { item: unknown }) {
  if (isPlainObject(item)) {
    const entries = Object.entries(item);
    if (entries.length > 0) {
      return (
        <dl className="cc-discount-band" style={{ margin: 0, fontSize: "0.875rem" }}>
          {entries.map(([key, val]) => (
            <div key={key} style={{ display: "flex", gap: 8, marginBottom: 4, minWidth: 0 }}>
              <dt style={{ ...MUTED_STYLE, flexShrink: 0 }}>{key}:</dt>
              <dd style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{String(val)}</dd>
            </div>
          ))}
        </dl>
      );
    }
  }
  return <div style={{ fontSize: "0.875rem" }}>{JSON.stringify(item)}</div>;
}

export function ArchitectDashboard() {
  const [snapshot, setSnapshot] = useState<ArchitectureSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/system/architecture");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as ArchitectureSnapshot;
      setSnapshot(data);
    } catch {
      setError(true);
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rootStyle: React.CSSProperties = {
    fontFamily: FONT_STACK,
    color: "var(--cc-ink)",
    background: "var(--cc-page)",
    minHeight: "100vh",
    padding: 24,
  };

  if (loading) {
    return (
      <div style={{ ...rootStyle, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ ...MUTED_STYLE, fontSize: "0.9375rem" }}>Loading system architecture…</span>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div style={{ ...rootStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <span style={{ fontSize: "0.9375rem" }}>Couldn't load the system architecture. Try refreshing.</span>
        <button
          type="button"
          onClick={load}
          style={{
            background: "var(--cc-grad)",
            color: "#ffffff",
            border: "none",
            borderRadius: 8,
            padding: "8px 18px",
            fontSize: "0.875rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const {
    application,
    agentRuntime,
    gateway,
    tools,
    policies,
    salesforce,
    agentforce,
    observability,
    warnings,
  } = snapshot;

  return (
    <div className="cc-architecture" style={rootStyle}>
      <div className="cc-architecture__inner" style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div className="cc-architecture__header" style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>System Architecture</h1>
          <div style={{ ...MUTED_STYLE, fontSize: "0.8125rem", marginTop: 6 }}>
            Snapshot generated at {formatGeneratedAt(snapshot.generatedAt)}
          </div>
        </div>

        {warnings.length > 0 && (
          <div style={{ ...WARNING_BANNER_STYLE, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Honesty notes</div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="cc-architecture-grid" style={{ ...GRID_STYLE, marginBottom: 24 }}>
          <div className="cc-architecture-card" style={CARD_STYLE}>
            <div style={SECTION_HEADING_STYLE}>Application</div>
            <FieldRow label="Name" value={application.name} />
            <ListBlock label="API routes" items={application.apiRoutes} />
          </div>

          <div className="cc-architecture-card" style={CARD_STYLE}>
            <div style={SECTION_HEADING_STYLE}>Agent Runtime</div>
            <FieldRow label="Model" value={agentRuntime.model} />
            <FieldRow label="Model provider host" value={agentRuntime.apiHost} />
            <FieldRow label="Tool loop limit" value={String(agentRuntime.toolLoopLimit)} />
            <FieldRow
              label="Confirmation required"
              value={agentRuntime.confirmationRequired ? "Yes" : "No"}
            />
          </div>

          <div className="cc-architecture-card" style={CARD_STYLE}>
            <div style={SECTION_HEADING_STYLE}>Data Gateway</div>
            <FieldRow
              label="Mode"
              value={
                <span style={gateway.mode === "salesforce" ? READ_PILL : WRITE_PILL}>
                  {gateway.mode === "salesforce" ? "salesforce" : "mock"}
                </span>
              }
            />
            <div style={{ marginTop: 10, fontSize: "0.875rem", lineHeight: 1.5 }}>
              <span style={{ ...MUTED_STYLE, display: "block", marginBottom: 4 }}>Reason</span>
              {gateway.reason}
            </div>
          </div>

          <div className="cc-architecture-card" style={CARD_STYLE}>
            <div style={SECTION_HEADING_STYLE}>Salesforce</div>
            <ListBlock label="Objects" items={salesforce.objects} />
            <ListBlock label="Flow actions" items={salesforce.flowActions} />
          </div>

          <div className="cc-architecture-card" style={CARD_STYLE}>
            <div style={SECTION_HEADING_STYLE}>Agentforce</div>
            <ListBlock label="Operation IDs" items={agentforce.operationIds} />
            <div style={{ marginTop: 10 }}>
              <span style={{ ...MUTED_STYLE, fontSize: "0.8125rem", display: "block", marginBottom: 6 }}>
                Deployment status
              </span>
              <span style={STATUS_PILL}>{agentforce.deploymentStatus}</span>
            </div>
          </div>

          <div className="cc-architecture-card" style={CARD_STYLE}>
            <div style={SECTION_HEADING_STYLE}>Observability</div>
            <FieldRow label="Trace store" value={observability.traceStore} />
            <div style={{ marginTop: 10 }}>
              <span style={{ ...MUTED_STYLE, fontSize: "0.8125rem", display: "block", marginBottom: 6 }}>
                Durable
              </span>
              {observability.durable ? (
                <span style={READ_PILL}>Durable</span>
              ) : (
                <span style={WRITE_PILL}>Not durable — in-memory only</span>
              )}
            </div>
          </div>
        </div>

        <div className="cc-architecture-card cc-tool-catalog" style={{ ...CARD_STYLE, marginBottom: 24 }}>
          <div style={SECTION_HEADING_STYLE}>Tool Catalog</div>
          <div className="cc-tool-catalog__viewport" style={{ overflowX: "auto" }}>
            <table style={TABLE_STYLE}>
              <thead>
                <tr>
                  <th style={TH_STYLE}>Name</th>
                  <th style={TH_STYLE}>Kind</th>
                  <th style={TH_STYLE}>Confirmation required</th>
                  <th style={TH_STYLE}>Description</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((tool) => {
                  const isExpanded = expandedTool === tool.name;
                  return (
                    <Fragment key={tool.name}>
                      <tr
                        style={{ cursor: "pointer" }}
                        onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
                      >
                        <td data-label="Name" style={{ ...TD_STYLE, fontWeight: 600 }}>{tool.name}</td>
                        <td data-label="Kind" style={TD_STYLE}>
                          <span style={tool.kind === "read" ? READ_PILL : WRITE_PILL}>
                            {tool.kind === "read" ? "READ" : "WRITE"}
                          </span>
                        </td>
                        <td data-label="Confirmation" style={TD_STYLE}>{tool.confirmationRequired ? "Yes" : "No"}</td>
                        <td data-label="Description" style={{ ...TD_STYLE, maxWidth: 360 }}>{tool.description}</td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={4} style={{ ...TD_STYLE, background: "var(--cc-fill)" }}>
                            <div style={{ ...MUTED_STYLE, fontSize: "0.8125rem", marginBottom: 6 }}>
                              Input schema
                            </div>
                            <pre className="cc-tool-schema"
                              style={{
                                margin: 0,
                                padding: 12,
                                background: "#ffffff",
                                border: "1px solid var(--cc-border)",
                                borderRadius: 8,
                                overflowX: "auto",
                                fontSize: "0.8125rem",
                                lineHeight: 1.5,
                              }}
                            >
                              {JSON.stringify(tool.inputSchema, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="cc-architecture-card cc-policies" style={CARD_STYLE}>
          <div style={SECTION_HEADING_STYLE}>Policies</div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ ...MUTED_STYLE, fontSize: "0.8125rem", marginBottom: 8 }}>Discount bands</div>
            {policies.discountBands.length === 0 ? (
              <div style={{ fontSize: "0.875rem" }}>None</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
                {policies.discountBands.map((band, index) => (
                  <li key={index} style={{ marginBottom: 6 }}>
                    <DiscountBandItem item={band} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ ...MUTED_STYLE, fontSize: "0.8125rem", marginBottom: 8 }}>Protected mutations</div>
            {policies.protectedMutations.length === 0 ? (
              <div style={{ fontSize: "0.875rem" }}>None</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, fontSize: "0.875rem" }}>
                {policies.protectedMutations.map((mutation) => (
                  <li key={mutation}>{mutation}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div style={{ ...MUTED_STYLE, fontSize: "0.8125rem", marginBottom: 8 }}>Resilience</div>
            <span style={policies.resilience.wired ? READ_PILL : WRITE_PILL}>
              {policies.resilience.wired
                ? "Wired into live requests"
                : "Built but not currently called"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
