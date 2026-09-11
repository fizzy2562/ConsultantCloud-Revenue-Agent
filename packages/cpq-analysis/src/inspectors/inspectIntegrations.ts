import type { Connection } from "jsforce";

function meta(source: "salesforce" = "salesforce") {
  return { requestId: crypto.randomUUID(), durationMs: 0, source };
}

export interface NamedCredentialSummary {
  developerName: string;
  endpoint: string | null;
}

export interface RemoteSiteSettingSummary {
  siteName: string;
  endpointUrl: string | null;
  isActive: boolean;
}

export interface ConnectedAppSummary {
  name: string;
}

export interface IntegrationCounts {
  namedCredentialsTotal: number;
  namedCredentialsCustom: number;
  remoteSiteSettingsTotal: number;
  remoteSiteSettingsCustom: number;
  connectedApplicationsTotal: number;
}

export interface InspectIntegrationsData {
  counts: IntegrationCounts;
  customNamedCredentials: NamedCredentialSummary[];
  customRemoteSiteSettings: RemoteSiteSettingSummary[];
  connectedApplications: ConnectedAppSummary[];
}

export type InspectIntegrationsResult =
  | { ok: true; data: InspectIntegrationsData; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const inspectIntegrationsTool = {
  name: "inspect_integrations",
  title: "Inspect Integrations (Named Credentials, Remote Site Settings, Connected Apps)",
  description: "Inventories customer-created (non-managed-package) Named Credentials and Remote Site Settings, plus all Connected Applications, as evidence of external system integration. Excludes the CPQ managed package's own pre-shipped Remote Site Settings. Read-only; no credential secrets are read or returned.",
  kind: "read" as const,
  inputSchema: { type: "object", properties: {}, required: [] },
};

export async function inspectIntegrationsHandler(conn: Connection, input: Record<string, never>): Promise<InspectIntegrationsResult> {
  try {
    // NamedCredential and RemoteSiteSetting rows shipped by the CPQ managed package
    // (NamespacePrefix = 'SBQQ') are the package's own internal callouts, not customer
    // integrations, so only NamespacePrefix = null rows are reported as "custom".
    // ConnectedApplication has no NamespacePrefix field, so all rows are reported.
    const [
      ncCount,
      ncCustom,
      rssCount,
      rssCustom,
      ca,
    ] = await Promise.all([
      conn.tooling.query<any>(`SELECT COUNT() FROM NamedCredential`),
      conn.tooling.query<any>(`SELECT DeveloperName, Endpoint FROM NamedCredential WHERE NamespacePrefix = null LIMIT 200`),
      conn.tooling.query<any>(`SELECT COUNT() FROM RemoteSiteSetting`),
      conn.tooling.query<any>(`SELECT SiteName, EndpointUrl, IsActive FROM RemoteSiteSetting WHERE NamespacePrefix = null LIMIT 200`),
      conn.tooling.query<any>(`SELECT Name FROM ConnectedApplication LIMIT 200`),
    ]);

    const data: InspectIntegrationsData = {
      counts: {
        namedCredentialsTotal: ncCount.totalSize,
        namedCredentialsCustom: ncCustom.records.length,
        remoteSiteSettingsTotal: rssCount.totalSize,
        remoteSiteSettingsCustom: rssCustom.records.length,
        connectedApplicationsTotal: ca.records.length,
      },
      customNamedCredentials: ncCustom.records.map((r: any) => ({
        developerName: r.DeveloperName,
        endpoint: r.Endpoint ?? null,
      })),
      customRemoteSiteSettings: rssCustom.records.map((r: any) => ({
        siteName: r.SiteName,
        endpointUrl: r.EndpointUrl ?? null,
        isActive: r.IsActive ?? false,
      })),
      connectedApplications: ca.records.map((r: any) => ({
        name: r.Name,
      })),
    };

    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
