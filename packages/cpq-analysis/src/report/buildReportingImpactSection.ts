import type { InspectorResult } from "./buildInventorySection";

interface ReportSummary {
  id: string;
  name: string;
  folderName: string | null;
  referencesSbqq: boolean;
}

interface DashboardSummary {
  id: string;
  title: string;
  folderName: string | null;
  referencesSbqq: boolean;
}

interface ReportingImpactCounts {
  reportsTotal: number;
  reportsScanned: number;
  reportsReferencingSbqq: number;
  dashboardsTotal: number;
  dashboardsScanned: number;
  dashboardsReferencingSbqq: number;
}

interface InspectReportingImpactData {
  counts: ReportingImpactCounts;
  reports: ReportSummary[];
  dashboards: DashboardSummary[];
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

function folderLabel(folderName: string | null): string {
  return folderName === null ? "no folder" : md(folderName);
}

export function buildReportingImpactSection(raw: Record<string, InspectorResult>): string {
  const lines: string[] = [];
  lines.push("## Reporting Impact");
  lines.push("");

  const data = getOkData<InspectReportingImpactData>(raw, "inspect_reporting_impact");
  if (data === null) {
    lines.push(failureNote(raw, "inspect_reporting_impact"));
    lines.push("");
    return lines.join("\n");
  }

  const { counts, reports, dashboards } = data;

  lines.push(
    `Scanned \`${counts.reportsScanned}\` of \`${counts.reportsTotal}\` total Report(s) and \`${counts.dashboardsScanned}\` of \`${counts.dashboardsTotal}\` total Dashboard(s) for references to SBQQ (CPQ) objects in their underlying definitions.`
  );
  if (counts.reportsTotal > counts.reportsScanned || counts.dashboardsTotal > counts.dashboardsScanned) {
    lines.push(
      "This is a bounded sample (capped at 30 per type); the totals above reflect the full org, but only the scanned subset was checked for SBQQ references."
    );
  }
  lines.push("");

  lines.push("### Reports and Dashboards referencing CPQ");
  lines.push("");
  lines.push("| Type | Total | Scanned | Referencing CPQ |");
  lines.push("|---|---:|---:|---:|");
  lines.push(`| Reports | ${counts.reportsTotal} | ${counts.reportsScanned} | ${counts.reportsReferencingSbqq} |`);
  lines.push(`| Dashboards | ${counts.dashboardsTotal} | ${counts.dashboardsScanned} | ${counts.dashboardsReferencingSbqq} |`);
  lines.push("");

  lines.push("### Reports referencing SBQQ objects");
  lines.push("");
  const referencingReports = reports.filter((r) => r.referencesSbqq).slice(0, 15);
  if (referencingReports.length === 0) {
    lines.push("_No scanned reports reference SBQQ (CPQ) objects._");
  } else {
    for (const report of referencingReports) {
      lines.push(`- **${md(report.name)}** (${folderLabel(report.folderName)})`);
    }
  }
  lines.push("");

  lines.push("### Dashboards referencing SBQQ objects");
  lines.push("");
  const referencingDashboards = dashboards.filter((d) => d.referencesSbqq).slice(0, 15);
  if (referencingDashboards.length === 0) {
    lines.push("_No scanned dashboards reference SBQQ (CPQ) objects._");
  } else {
    for (const dashboard of referencingDashboards) {
      lines.push(`- **${md(dashboard.title)}** (${folderLabel(dashboard.folderName)})`);
    }
  }
  lines.push("");

  lines.push("### Method note");
  lines.push("");
  lines.push(
    `_SBQQ reference detection works by serializing each report's or dashboard's full definition (columns, filters, groupings) to text and checking for the "SBQQ" substring -- a simple, robust check that does not require knowing every possible report type's exact metadata shape, but is a string match, not real dependency analysis._`
  );
  lines.push("");
  lines.push(
    `_Reports and dashboards this connection cannot access (private folders, insufficient sharing) are not counted or scanned -- absence from this section is not proof a report doesn't reference CPQ data, only that it wasn't visible to this scan._`
  );
  lines.push("");

  return lines.join("\n");
}
