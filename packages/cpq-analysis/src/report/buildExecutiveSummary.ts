import type { AssessmentItem, Disposition, ReadinessDimensionId } from "./assessmentTypes";
import { READINESS_DIMENSIONS } from "./assessmentTypes";
import type { ReadinessResult } from "./buildReadinessScore";
import type { InspectorResult } from "./buildInventorySection";

interface InspectPriceRulesData { priceRules: Array<{ id: string }> }
interface InspectDiscountSchedulesData { discountSchedules: Array<{ id: string }> }
interface InspectProductRulesData { productRules: Array<{ id: string; scope: string | null }> }
interface InspectCustomScriptsData { customScripts: Array<{ id: string }> }
interface InspectCatalogStructureData {
  products: Array<{ id: string }>;
  productOptions: Array<{ id: string }>;
  productFeatures: Array<{ id: string }>;
}
interface DetectTwinFieldsData { twinFieldPairs: Array<{ id?: string; sourceObject: string; destinationObject: string; fieldName: string }> }

function getOkData<T>(raw: Record<string, InspectorResult>, key: string): T | null {
  const entry = raw[key];
  if (entry && entry.ok === true) {
    return entry.data as T;
  }
  return null;
}

function getCount<T>(raw: Record<string, InspectorResult>, key: string, extract: (data: T) => Array<unknown>): number {
  const data = getOkData<T>(raw, key);
  if (!data) return 0;
  const arr = extract(data);
  return Array.isArray(arr) ? arr.length : 0;
}

function dimensionLabel(id: ReadinessDimensionId): string {
  const found = READINESS_DIMENSIONS.find((d) => d.id === id);
  return found ? found.label : id;
}

function formatCoverage(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

const DISPOSITION_ORDER: Disposition[] = ["DIRECT", "TRANSFORM", "REDESIGN", "RETIRE", "INVESTIGATE", "BLOCKED"];

const PHASE_HINTS: Partial<Record<ReadinessDimensionId, string>> = {
  installedBaseLifecycle: "planned Phase 2A: contracts, subscriptions, assets, renewals, amendments",
  integrations: "planned Phase 4: named credentials, connected apps, external system detection",
  reportingSecurityOps: "planned Phase 4/5: reports, dashboards, security/sharing review",
  testingCutover: "planned Phase 5: regression scenarios, cutover and coexistence planning",
};

function buildReadinessHeadline(readiness: ReadinessResult): string {
  const lines: string[] = [];

  if (readiness.overallReadiness === null) {
    lines.push("**Overall readiness:** Not yet available — no assessed dimensions.");
  } else {
    const suffix = readiness.isProvisional ? " (Provisional)" : "";
    lines.push(`**Overall readiness:** ${readiness.overallReadiness} / 100${suffix}`);
  }

  lines.push("");
  lines.push(
    `**Assessment coverage:** ${formatCoverage(readiness.coveragePercent)}% of a full nine-dimension migration assessment (see "Not yet assessed" below).`
  );

  if (readiness.isProvisional) {
    lines.push("");
    lines.push(
      "This score is Provisional: it will not be presented as final until assessment coverage reaches 70%, no dimension is wholly unassessed, and every inspector completes successfully."
    );
  }

  return lines.join("\n");
}

function buildFootprintTable(raw: Record<string, InspectorResult>): string {
  const rows: Array<[string, number]> = [
    ["Products", getCount<InspectCatalogStructureData>(raw, "inspect_catalog_structure", (d) => d.products)],
    ["Product Options", getCount<InspectCatalogStructureData>(raw, "inspect_catalog_structure", (d) => d.productOptions)],
    ["Product Features", getCount<InspectCatalogStructureData>(raw, "inspect_catalog_structure", (d) => d.productFeatures)],
    ["Price Rules", getCount<InspectPriceRulesData>(raw, "inspect_price_rules", (d) => d.priceRules)],
    ["Discount Schedules", getCount<InspectDiscountSchedulesData>(raw, "inspect_discount_schedules", (d) => d.discountSchedules)],
    ["Product Rules", getCount<InspectProductRulesData>(raw, "inspect_product_rules", (d) => d.productRules)],
    ["Custom Scripts (QCP)", getCount<InspectCustomScriptsData>(raw, "inspect_custom_scripts", (d) => d.customScripts)],
    ["Twin Field pairs", getCount<DetectTwinFieldsData>(raw, "detect_twin_fields", (d) => d.twinFieldPairs)],
  ];

  const lines: string[] = [];
  lines.push("| Metric | Count |");
  lines.push("|---|---:|");
  for (const [metric, count] of rows) {
    lines.push(`| ${metric} | ${count} |`);
  }
  return lines.join("\n");
}

function buildDispositionTable(readiness: ReadinessResult): string {
  const lines: string[] = [];
  lines.push("| Disposition | Count |");
  lines.push("|---|---:|");
  for (const d of DISPOSITION_ORDER) {
    const count = readiness.dispositionCounts[d] ?? 0;
    lines.push(`| ${d} | ${count} |`);
  }
  return lines.join("\n");
}

function buildTopRisks(items: AssessmentItem[]): string {
  const riskRank: Record<string, number> = { High: 0, "Medium-High": 1 };
  const candidates = items
    .filter((i) => i.risk === "High" || i.risk === "Medium-High")
    .sort((a, b) => (riskRank[a.risk] ?? 99) - (riskRank[b.risk] ?? 99))
    .slice(0, 3);

  if (candidates.length === 0) {
    return "_No high-risk items identified from the categories assessed so far._";
  }

  return candidates
    .map((i) => `- **${i.name}** (${dimensionLabel(i.dimension)}): ${i.recommendation}`)
    .join("\n");
}

function buildQuickWins(items: AssessmentItem[]): string {
  const candidates = items
    .filter((i) => i.disposition === "DIRECT" || i.disposition === "RETIRE")
    .slice(0, 3);

  if (candidates.length === 0) {
    return "_No zero-effort items identified from the categories assessed so far. This will improve as installed-base, integration, and other transactional evidence is added in later report phases._";
  }

  return candidates
    .map((i) => `- **${i.name}**: ${i.recommendation}`)
    .join("\n");
}

function buildNotYetAssessed(readiness: ReadinessResult): string {
  const unassessed = readiness.dimensions.filter((d) => d.score === null);

  if (unassessed.length === 0) {
    return "_All nine readiness dimensions have at least some assessed evidence._";
  }

  return unassessed
    .map((d) => {
      const hint = PHASE_HINTS[d.id] ?? "planned in a future report phase";
      return `- **${d.label}** — no inspector covers this yet (${hint}).`;
    })
    .join("\n");
}

function buildNextDecisions(): string {
  return [
    "- Confirm which Revenue Cloud / Revenue Management edition and release this migration targets, and verify every suggested target object above against that release before finalizing design.",
    "- Decide how to obtain the still-unassessed installed base, integration, and reporting evidence (live org scan vs. stakeholder interviews) — the readiness score cannot leave Provisional status without it.",
    "- Review every INVESTIGATE and BLOCKED item below with the business process owner; these cannot be sequenced until their disposition is resolved.",
  ].join("\n");
}

export function buildExecutiveSummary(
  items: AssessmentItem[],
  readiness: ReadinessResult,
  raw: Record<string, InspectorResult>
): string {
  const sections: string[] = [];

  sections.push("## Executive Summary");
  sections.push("");
  sections.push(buildReadinessHeadline(readiness));
  sections.push("");

  sections.push("### CPQ footprint");
  sections.push("");
  sections.push(buildFootprintTable(raw));
  sections.push("");

  sections.push("### Recommended disposition");
  sections.push("");
  sections.push(buildDispositionTable(readiness));
  sections.push("");

  sections.push("### Top risks");
  sections.push("");
  sections.push(buildTopRisks(items));
  sections.push("");

  sections.push("### Quick wins");
  sections.push("");
  sections.push(buildQuickWins(items));
  sections.push("");

  sections.push("### Not yet assessed");
  sections.push("");
  sections.push(buildNotYetAssessed(readiness));
  sections.push("");

  sections.push("### Next decisions");
  sections.push("");
  sections.push(buildNextDecisions());

  return sections.join("\n");
}
