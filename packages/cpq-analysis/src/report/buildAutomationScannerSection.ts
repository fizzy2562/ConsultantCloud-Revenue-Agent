import type { InspectorResult } from "./buildInventorySection";

interface CustomApexComponent {
  id: string;
  name: string;
  type: "ApexClass" | "ApexTrigger";
  referencesSbqq: boolean;
}

interface FlowSummary {
  id: string;
  developerName: string;
  namespacePrefix: string | null;
}

interface AutomationScannerCounts {
  apexClassesTotal: number;
  apexClassesCustom: number;
  apexTriggersTotal: number;
  apexTriggersCustom: number;
  validationRulesTotal: number;
  validationRulesCustom: number;
  flowsTotal: number;
}

interface InspectAutomationScannerData {
  counts: AutomationScannerCounts;
  customApexComponents: CustomApexComponent[];
  flows: FlowSummary[];
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

export function buildAutomationScannerSection(raw: Record<string, InspectorResult>): string {
  const lines: string[] = [];
  lines.push("## Custom Automation Scan");
  lines.push("");

  const data = getOkData<InspectAutomationScannerData>(raw, "inspect_automation_scanner");
  if (data === null) {
    lines.push(failureNote(raw, "inspect_automation_scanner"));
    return lines.join("\n");
  }

  const { counts, customApexComponents, flows } = data;

  lines.push(
    "Scanned for customer-authored automation, excluding the CPQ managed package's own internal code (which is not customer migration risk)."
  );
  lines.push("");
  lines.push(
    `Found ${plural(counts.apexClassesCustom, "custom Apex class", "custom Apex classes")} (of ${counts.apexClassesTotal} total, including managed package), ${plural(counts.apexTriggersCustom, "custom trigger")} (of ${counts.apexTriggersTotal} total), and ${plural(counts.validationRulesCustom, "custom active validation rule")} (of ${counts.validationRulesTotal} total).`
  );
  lines.push("");

  lines.push("### Components referencing CPQ objects");
  lines.push("");
  if (customApexComponents.length === 0) {
    lines.push("_No customer-authored Apex classes or triggers were found in this org._");
  } else {
    const referencing = customApexComponents.filter((c) => c.referencesSbqq);
    if (referencing.length === 0) {
      lines.push(
        `_${plural(customApexComponents.length, "custom Apex component")} found, but none appear to reference SBQQ (CPQ) objects in their source._`
      );
    } else {
      for (const component of referencing) {
        lines.push(`- **${md(component.name)}** (${component.type}): references SBQQ (CPQ) objects in its source.`);
      }
    }
  }
  lines.push("");

  lines.push("### Flows");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|---|---:|");
  lines.push(`| Total Flows | ${counts.flowsTotal} |`);
  lines.push("");
  if (flows.length > 0) {
    for (const flow of flows.slice(0, 10)) {
      lines.push(`- **${md(flow.developerName)}**`);
    }
  } else {
    lines.push("_No Flows were found in this org._");
  }
  lines.push("");

  lines.push("### Method note");
  lines.push("");
  lines.push(
    "_This scan distinguishes total component counts (including the CPQ managed package's own internal code) from customer-authored (\"custom\") components, since managed-package internals are not customer migration risk. Only custom Apex classes and triggers are checked for SBQQ references._"
  );
  lines.push("");
  lines.push(
    "_The SBQQ reference check is a simple substring match against source code, not real dependency analysis -- it is a starting point for investigation, not a complete dependency graph. Flows are listed by name only; distinguishing a genuine customer-built Flow from a Salesforce platform default requires manual review._"
  );

  return lines.join("\n");
}
