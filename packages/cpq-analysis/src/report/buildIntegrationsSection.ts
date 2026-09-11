import type { InspectorResult } from "./buildInventorySection";

interface NamedCredentialSummary {
  developerName: string;
  endpoint: string | null;
}

interface RemoteSiteSettingSummary {
  siteName: string;
  endpointUrl: string | null;
  isActive: boolean;
}

interface ConnectedAppSummary {
  name: string;
}

interface IntegrationCounts {
  namedCredentialsTotal: number;
  namedCredentialsCustom: number;
  remoteSiteSettingsTotal: number;
  remoteSiteSettingsCustom: number;
  connectedApplicationsTotal: number;
}

interface InspectIntegrationsData {
  counts: IntegrationCounts;
  customNamedCredentials: NamedCredentialSummary[];
  customRemoteSiteSettings: RemoteSiteSettingSummary[];
  connectedApplications: ConnectedAppSummary[];
}

function md(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function plural(count: number, singular: string, pluralForm?: string): string {
  const form = count === 1 ? singular : pluralForm ?? `${singular}s`;
  return `${count} ${form}`;
}

function getOkData<T>(raw: Record<string, InspectorResult>, key: string): T | null {
  const result = raw[key];
  if (result && result.ok) return result.data as T;
  return null;
}

function failureNote(raw: Record<string, InspectorResult>, key: string): string {
  const result = raw[key];
  if (result && !result.ok) return `_Inspector failed: ${result.error.message}_`;
  return "_No data returned for this inspector._";
}

export function buildIntegrationsSection(raw: Record<string, InspectorResult>): string {
  const lines: string[] = [];
  lines.push("## Integration Impact Assessment");
  lines.push("");

  const data = getOkData<InspectIntegrationsData>(raw, "inspect_integrations");
  if (data === null) {
    lines.push(failureNote(raw, "inspect_integrations"));
    return lines.join("\n");
  }

  const { counts, customNamedCredentials, customRemoteSiteSettings, connectedApplications } = data;

  lines.push(
    "Scanned for customer-created integration points, excluding the CPQ managed package's own pre-shipped Remote Site Settings (which are not customer integrations).",
  );
  lines.push("");
  lines.push(
    `Found ${plural(counts.namedCredentialsCustom, "custom Named Credential")} (of ${counts.namedCredentialsTotal} total), ${plural(counts.remoteSiteSettingsCustom, "custom Remote Site Setting")} (of ${counts.remoteSiteSettingsTotal} total), and ${plural(counts.connectedApplicationsTotal, "Connected Application")}.`,
  );
  lines.push("");

  lines.push("### Named Credentials");
  lines.push("");
  if (customNamedCredentials.length === 0) {
    lines.push("_No customer-created Named Credentials were found._");
  } else {
    for (const nc of customNamedCredentials) {
      lines.push(`- **${nc.developerName}** — \`${md(nc.endpoint)}\``);
    }
  }
  lines.push("");

  lines.push("### Remote Site Settings");
  lines.push("");
  if (customRemoteSiteSettings.length === 0) {
    lines.push(
      "_No customer-created Remote Site Settings were found (beyond the CPQ managed package's own)._",
    );
  } else {
    for (const rss of customRemoteSiteSettings) {
      const state = rss.isActive ? "active" : "inactive";
      lines.push(`- **${rss.siteName}** — \`${md(rss.endpointUrl)}\` (${state})`);
    }
  }
  lines.push("");

  lines.push("### Connected Applications");
  lines.push("");
  if (connectedApplications.length === 0) {
    lines.push("_No Connected Applications were found._");
  } else {
    for (const app of connectedApplications.slice(0, 10)) {
      lines.push(`- **${app.name}**`);
    }
  }
  lines.push("");

  lines.push("### Method note");
  lines.push("");
  lines.push(
    "_This scan covers metadata visible to this connection: customer-created Named Credentials, customer-created Remote Site Settings, and Connected Applications. No credential secrets, passwords, or client secrets are read or displayed._",
  );
  lines.push("");
  lines.push(
    "_Metadata alone cannot reveal every external system that integrates with this org -- an inbound integration (an external system calling into Salesforce via its API) leaves no trace here, and middleware-owned field mappings live outside Salesforce entirely. Confirm the full integration landscape with the business/IT owner rather than treating this list as complete._",
  );

  return lines.join("\n");
}
