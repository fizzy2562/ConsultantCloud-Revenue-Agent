import type { AssessmentItem, RiskLevel } from "./assessmentTypes";

function plural(count: number, singular: string, pluralForm?: string): string {
  const form = count === 1 ? singular : pluralForm ?? `${singular}s`;
  return `${count} ${form}`;
}

const RISK_ORDER: RiskLevel[] = ["High", "Medium-High", "Medium", "Low", "N/A"];

function priorityFor(risk: RiskLevel): "High" | "Medium" | "Low" {
  if (risk === "High" || risk === "Medium-High") return "High";
  if (risk === "Medium") return "Medium";
  return "Low";
}

/**
 * Every scenario here is generated straight from this report's own disposition items -- there is
 * no independent "test generation" logic to get wrong, and nothing here claims to have been run.
 * Per the project's own guidance: a candidate scenario is a starting point for a QA team to build
 * out with real expected outcomes and test data, never presented as executed test coverage.
 */
export function buildTestingCutoverSection(items: AssessmentItem[]): string {
  const lines: string[] = [];
  lines.push("## Testing, Cutover & Coexistence Readiness");
  lines.push("");

  const testable = items.filter((item) => item.disposition !== "RETIRE");
  lines.push(
    `Generated ${plural(testable.length, "regression scenario candidate")} from the categories assessed above -- one per item that is not already fully resolved (RETIRE items are excluded: there is nothing to regression-test when nothing was found).`
  );
  lines.push("");

  lines.push("### Regression scenario candidates");
  lines.push("");
  if (testable.length === 0) {
    lines.push("_No regression scenario candidates were generated -- every assessed category resolved to RETIRE (nothing found to migrate)._");
  } else {
    const sorted = [...testable].sort((a, b) => RISK_ORDER.indexOf(a.risk) - RISK_ORDER.indexOf(b.risk));
    lines.push("| Priority | Scenario | Category |");
    lines.push("|---|---|---|");
    for (const item of sorted) {
      lines.push(`| ${priorityFor(item.risk)} | Validate migrated behavior for **${item.name}**: ${item.recommendation} | ${item.dimension} |`);
    }
  }
  lines.push("");

  lines.push("### Cutover and coexistence checklist");
  lines.push("");
  lines.push("These require confirmation from the business/project team -- none of them are determinable from Salesforce org data alone:");
  lines.push("");
  lines.push("- A coexistence plan is documented: which CPQ and Revenue Cloud functionality run in parallel, and for how long.");
  lines.push("- At least one active CPQ license is retained through go-live, for rollback and side-by-side validation.");
  lines.push("- A data reconciliation process is defined: how migrated records will be checked against source-of-truth CPQ data before cutover.");
  lines.push("- A rollback plan exists if migration validation fails post-cutover.");
  lines.push("- Frozen-transaction handling is defined: how in-flight quotes/orders at cutover time are handled.");
  lines.push("- Every INVESTIGATE and BLOCKED item in this report has an assigned owner and a target resolution date.");
  lines.push("");

  lines.push("### Method note");
  lines.push("");
  lines.push(
    "_Regression scenario candidates are generated from this report's own disposition items -- they are starting points for a QA team to build out with real expected outcomes and test data, not executed tests. No scenario here has been run; \"candidate\" means untested. Score/readiness thresholds have not been calibrated against real customer org shapes or reviewed by a Revenue Cloud architect -- treat priority ordering as a starting point for discussion, not a validated ranking. The cutover/coexistence checklist requires facts this report cannot observe from Salesforce data alone._"
  );

  return lines.join("\n");
}
