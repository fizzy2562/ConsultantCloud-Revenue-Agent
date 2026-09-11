import type { Connection } from "jsforce";

function meta(source: "salesforce" = "salesforce") {
  return { requestId: crypto.randomUUID(), durationMs: 0, source };
}

export interface ReportSummary {
  id: string;
  name: string;
  folderName: string | null;
  referencesSbqq: boolean;
}

export interface DashboardSummary {
  id: string;
  title: string;
  folderName: string | null;
  referencesSbqq: boolean;
}

export interface ReportingImpactCounts {
  reportsTotal: number;
  reportsScanned: number;
  reportsReferencingSbqq: number;
  dashboardsTotal: number;
  dashboardsScanned: number;
  dashboardsReferencingSbqq: number;
}

export interface InspectReportingImpactData {
  counts: ReportingImpactCounts;
  reports: ReportSummary[];
  dashboards: DashboardSummary[];
}

export type InspectReportingImpactResult =
  | { ok: true; data: InspectReportingImpactData; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const inspectReportingImpactTool = {
  name: "inspect_reporting_impact",
  title: "Inspect Reporting Impact (Reports, Dashboards)",
  description: "Scans Reports and Dashboards (bounded to 30 each) for references to SBQQ (CPQ) objects in their underlying definition, via the Analytics REST API describe endpoint. Read-only.",
  kind: "read" as const,
  inputSchema: { type: "object", properties: {}, required: [] },
};

export async function inspectReportingImpactHandler(conn: Connection, input: Record<string, never>): Promise<InspectReportingImpactResult> {
  // We JSON.stringify the whole describe metadata and substring-check for "SBQQ" rather than
  // parsing specific fields, because the shape of reportMetadata/dashboardMetadata varies by
  // report type and we want a robust catch-all. Each describe call is error-isolated so one
  // inaccessible report/dashboard does not abort the rest.
  try {
    const [reportCount, reportList, dashboardCount, dashboardList] = await Promise.all([
      conn.query<any>(`SELECT COUNT() FROM Report`),
      conn.query<any>(`SELECT Id, Name, FolderName FROM Report LIMIT 30`),
      conn.query<any>(`SELECT COUNT() FROM Dashboard`),
      conn.query<any>(`SELECT Id, Title, FolderName FROM Dashboard LIMIT 30`),
    ]);

    const reports: ReportSummary[] = await Promise.all(
      reportList.records.map(async (r: any) => {
        let referencesSbqq = false;
        try {
          const describeResult = await conn.requestGet<any>(`/services/data/v67.0/analytics/reports/${encodeURIComponent(r.Id)}/describe`);
          referencesSbqq = JSON.stringify(describeResult.reportMetadata ?? {}).includes("SBQQ");
        } catch {
          referencesSbqq = false;
        }
        return { id: r.Id, name: r.Name, folderName: r.FolderName ?? null, referencesSbqq };
      })
    );

    const dashboards: DashboardSummary[] = await Promise.all(
      dashboardList.records.map(async (d: any) => {
        let referencesSbqq = false;
        try {
          const describeResult = await conn.requestGet<any>(`/services/data/v67.0/analytics/dashboards/${encodeURIComponent(d.Id)}/describe`);
          referencesSbqq = JSON.stringify(describeResult.dashboardMetadata ?? {}).includes("SBQQ");
        } catch {
          referencesSbqq = false;
        }
        return { id: d.Id, title: d.Title, folderName: d.FolderName ?? null, referencesSbqq };
      })
    );

    const counts: ReportingImpactCounts = {
      reportsTotal: reportCount.totalSize,
      reportsScanned: reportList.records.length,
      reportsReferencingSbqq: reports.filter((r) => r.referencesSbqq).length,
      dashboardsTotal: dashboardCount.totalSize,
      dashboardsScanned: dashboardList.records.length,
      dashboardsReferencingSbqq: dashboards.filter((d) => d.referencesSbqq).length,
    };

    const data: InspectReportingImpactData = { counts, reports, dashboards };
    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
