import { buildInventorySection, type InspectorResult } from "./buildInventorySection";
import { scoreComplexity } from "./scoreComplexity";
import { buildSequencingSection } from "./buildSequencingSection";
import { buildDispositions } from "./buildDispositions";
import { buildReadinessScore } from "./buildReadinessScore";
import { buildExecutiveSummary } from "./buildExecutiveSummary";
import { buildInstalledBaseSection } from "./buildInstalledBaseSection";
import { buildSellingModelSection } from "./buildSellingModelSection";
import { buildUsageAnalyticsSection } from "./buildUsageAnalyticsSection";
import { buildAutomationScannerSection } from "./buildAutomationScannerSection";
import { buildCustomFieldSection } from "./buildCustomFieldSection";
import { buildIntegrationsSection } from "./buildIntegrationsSection";
import { buildReportingImpactSection } from "./buildReportingImpactSection";
import { buildDependencyGraphSection } from "./buildDependencyGraphSection";
import { buildTestingCutoverSection } from "./buildTestingCutoverSection";

export type { InspectorResult };

export interface AssembleReportResult {
  report: string;
}

export async function assembleReport(raw: Record<string, InspectorResult>): Promise<AssembleReportResult> {
  const inventorySection = buildInventorySection(raw);
  const complexitySection = scoreComplexity(raw);
  const sequencingSection = buildSequencingSection(raw);

  const assessmentItems = buildDispositions(raw);
  const readiness = buildReadinessScore(assessmentItems, raw);
  const executiveSummary = buildExecutiveSummary(assessmentItems, readiness, raw);
  const installedBaseSection = buildInstalledBaseSection(raw);
  const sellingModelSection = buildSellingModelSection(raw);
  const usageAnalyticsSection = buildUsageAnalyticsSection(raw);
  const automationScannerSection = buildAutomationScannerSection(raw);
  const customFieldSection = buildCustomFieldSection(raw);
  const integrationsSection = buildIntegrationsSection(raw);
  const reportingImpactSection = buildReportingImpactSection(raw);
  const dependencyGraphSection = buildDependencyGraphSection(raw, assessmentItems);
  const testingCutoverSection = buildTestingCutoverSection(assessmentItems);

  const methodNote = [
    "## Method note",
    "",
    "This report is generated entirely deterministically from the thirteen read-only `@consultantcloud/cpq-analysis` inspector tools: a fixed, documented Revenue Cloud mapping table and an explicit complexity/risk rubric drive every section below -- no LLM or model judgment is used anywhere in this report. Quote Calculator Plugin (custom script) source code is displayed verbatim for manual developer review; no automated interpretation of its logic is attempted.",
  ].join("\n");

  const report = [
    "# CPQ -> Revenue Cloud Migration Readiness Report",
    "",
    methodNote,
    "",
    executiveSummary,
    "",
    installedBaseSection,
    "",
    sellingModelSection,
    "",
    usageAnalyticsSection,
    "",
    automationScannerSection,
    "",
    customFieldSection,
    "",
    integrationsSection,
    "",
    reportingImpactSection,
    "",
    dependencyGraphSection,
    "",
    testingCutoverSection,
    "",
    inventorySection,
    "",
    complexitySection,
    "",
    sequencingSection,
    "",
  ].join("\n");

  return { report };
}
