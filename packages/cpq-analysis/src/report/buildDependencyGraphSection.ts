import type { AssessmentItem } from "./assessmentTypes";
import type { InspectorResult } from "./buildInventorySection";

interface InspectPriceRulesData {
  priceRules: unknown[];
}

interface InspectDiscountSchedulesData {
  discountSchedules: Array<{ product: string | null }>;
}

interface InspectProductRulesData {
  productRules: Array<{ scope: string | null }>;
}

interface InspectCustomScriptsData {
  customScripts: unknown[];
}

interface InspectCatalogStructureData {
  products: Array<{ id: string }>;
}

interface DetectTwinFieldsData {
  twinFieldPairs: Array<{ sourceObject: string; destinationObject: string }>;
}

interface InspectInstalledBaseData {
  counts: { contractsTotal: number; subscriptionsTotal: number; assetsTotal: number };
}

interface InspectSellingModelData {
  counts: { productsClassified: number };
}

interface InspectQuoteUsageData {
  counts: { quoteLinesTotal: number };
}

interface InspectCustomFieldsData {
  countsByObject: Array<{ objectApiName: string; customFieldCount: number }>;
}

interface InspectAutomationScannerData {
  customApexComponents: Array<{ referencesSbqq: boolean }>;
}

interface InspectReportingImpactData {
  counts: { reportsReferencingSbqq: number; dashboardsReferencingSbqq: number };
}

type EvidenceClass = "Observed" | "Declared";

interface ObjectTouch {
  objectApiName: string;
  itemId: string;
  evidenceClass: EvidenceClass;
}

const UNSPECIFIED_OBJECT = "CPQ data (unspecified object — substring match only)";

function getOkData<T>(raw: Record<string, InspectorResult>, key: string): T | null {
  const result = raw[key];
  if (result && result.ok) return result.data as T;
  return null;
}

function plural(count: number, singular: string, pluralForm?: string): string {
  const form = count === 1 ? singular : pluralForm ?? `${singular}s`;
  return `${count} ${form}`;
}

function itemById(items: AssessmentItem[], id: string): AssessmentItem | undefined {
  return items.find((item) => item.id === id);
}

/**
 * Every touch below traces to a real field already returned by an existing inspector, or (where
 * marked "Declared") a documented CPQ architectural fact rather than a per-record query result --
 * never a guess. A price rule's own SBQQ__TargetObject__c picklist was checked live and found to
 * hold execution-phase values ("Configurator"/"Calculator"), not object references, so Price Rules
 * and Custom Scripts are marked Declared (they evaluate against Quote/QuoteLine data by CPQ's own
 * documented architecture) rather than Observed from this org's data. Automation and reporting
 * references are string-matches with no way to attribute a specific object, so they land in one
 * unspecified bucket instead of being assigned a specific (and fabricated) object.
 */
function computeObjectTouches(raw: Record<string, InspectorResult>, items: AssessmentItem[]): ObjectTouch[] {
  const touches: ObjectTouch[] = [];
  const push = (itemId: string, objectApiName: string, evidenceClass: EvidenceClass) => {
    if (!itemById(items, itemId)) return;
    touches.push({ itemId, objectApiName, evidenceClass });
  };

  const twinFields = getOkData<DetectTwinFieldsData>(raw, "detect_twin_fields");
  if (twinFields) {
    for (const pair of twinFields.twinFieldPairs) {
      push("twin-fields", pair.sourceObject, "Observed");
      push("twin-fields", pair.destinationObject, "Observed");
    }
  }

  const customFields = getOkData<InspectCustomFieldsData>(raw, "inspect_custom_fields");
  if (customFields) {
    for (const entry of customFields.countsByObject) {
      if (entry.customFieldCount > 0) push("custom-field-inventory", entry.objectApiName, "Observed");
    }
  }

  const discountSchedules = getOkData<InspectDiscountSchedulesData>(raw, "inspect_discount_schedules");
  if (discountSchedules?.discountSchedules.some((s) => s.product !== null)) {
    push("discount-schedules", "Product2", "Observed");
  }

  const productRules = getOkData<InspectProductRulesData>(raw, "inspect_product_rules");
  if (productRules) {
    if (productRules.productRules.some((r) => r.scope === "Product")) {
      push("product-rules-product-scope", "Product2", "Observed");
    }
    if (productRules.productRules.some((r) => r.scope !== "Product")) {
      push("product-rules-quote-scope", "SBQQ__Quote__c", "Observed");
    }
  }

  const catalog = getOkData<InspectCatalogStructureData>(raw, "inspect_catalog_structure");
  if (catalog && catalog.products.length > 0) push("catalog-structure", "Product2", "Observed");

  const sellingModel = getOkData<InspectSellingModelData>(raw, "inspect_selling_model");
  if (sellingModel) {
    push("selling-model-readiness", "Product2", "Observed");
    push("selling-model-readiness", "SBQQ__Subscription__c", "Observed");
  }

  const quoteUsage = getOkData<InspectQuoteUsageData>(raw, "inspect_quote_usage");
  if (quoteUsage) {
    push("quote-usage-rationalization", "Product2", "Observed");
    push("quote-usage-rationalization", "SBQQ__QuoteLine__c", "Observed");
  }

  const installedBase = getOkData<InspectInstalledBaseData>(raw, "inspect_installed_base");
  if (installedBase) {
    push("installed-base", "Contract", "Observed");
    push("installed-base", "SBQQ__Subscription__c", "Observed");
    push("installed-base", "Asset", "Observed");
    push("installed-base", "SBQQ__Quote__c", "Observed");
  }

  // Declared: CPQ's own documented architecture, not a field this org's data exposes directly.
  const priceRules = getOkData<InspectPriceRulesData>(raw, "inspect_price_rules");
  if (priceRules && priceRules.priceRules.length > 0) {
    push("price-rules", "SBQQ__Quote__c", "Declared");
    push("price-rules", "SBQQ__QuoteLine__c", "Declared");
  }

  const customScripts = getOkData<InspectCustomScriptsData>(raw, "inspect_custom_scripts");
  if (customScripts && customScripts.customScripts.length > 0) {
    push("custom-scripts", "SBQQ__Quote__c", "Declared");
    push("custom-scripts", "SBQQ__QuoteLine__c", "Declared");
  }

  // Unspecified: a substring match confirms SBQQ is referenced somewhere, not which object.
  const automation = getOkData<InspectAutomationScannerData>(raw, "inspect_automation_scanner");
  if (automation?.customApexComponents.some((c) => c.referencesSbqq)) {
    push("automation-scan", UNSPECIFIED_OBJECT, "Observed");
  }

  const reportingImpact = getOkData<InspectReportingImpactData>(raw, "inspect_reporting_impact");
  if (reportingImpact && (reportingImpact.counts.reportsReferencingSbqq > 0 || reportingImpact.counts.dashboardsReferencingSbqq > 0)) {
    push("reporting-impact", UNSPECIFIED_OBJECT, "Observed");
  }

  return touches;
}

export function buildDependencyGraphSection(raw: Record<string, InspectorResult>, items: AssessmentItem[]): string {
  const lines: string[] = [];
  lines.push("## Migration Blast Radius");
  lines.push("");

  const touches = computeObjectTouches(raw, items);
  if (touches.length === 0) {
    lines.push("_No cross-category object relationships could be derived from the categories assessed so far._");
    return lines.join("\n");
  }

  lines.push(
    "Connects every disposition item above to the Salesforce object(s) it actually touches, using fields each inspector already returns (never a guess) -- surfacing which objects carry the most migration risk if they change, and which items share an object and so cannot be sequenced independently."
  );
  lines.push("");

  const itemsByObject = new Map<string, Set<string>>();
  for (const touch of touches) {
    const set = itemsByObject.get(touch.objectApiName) ?? new Set<string>();
    set.add(touch.itemId);
    itemsByObject.set(touch.objectApiName, set);
  }

  const objectRows = [...itemsByObject.entries()]
    .map(([objectApiName, itemIds]) => ({
      objectApiName,
      itemIds: [...itemIds],
      names: [...itemIds].map((id) => itemById(items, id)?.name ?? id),
    }))
    .sort((a, b) => b.itemIds.length - a.itemIds.length);

  lines.push("### Objects by blast radius");
  lines.push("");
  lines.push("| Object | Items touching it | Items |");
  lines.push("|---|---:|---|");
  for (const row of objectRows) {
    lines.push(`| ${row.objectApiName} | ${row.itemIds.length} | ${row.names.join(", ")} |`);
  }
  lines.push("");

  const sharedObjectRows = objectRows.filter((row) => row.itemIds.length >= 2 && row.objectApiName !== UNSPECIFIED_OBJECT);
  lines.push("### Items that cannot be sequenced independently");
  lines.push("");
  if (sharedObjectRows.length === 0) {
    lines.push("_No two assessed items were found to share the same object -- no forced sequencing dependency identified from the categories assessed so far._");
  } else {
    for (const row of sharedObjectRows) {
      lines.push(`- **${row.objectApiName}**: ${plural(row.itemIds.length, "item")} touch this object (${row.names.join(", ")}) -- changes to one may affect the others.`);
    }
  }
  lines.push("");

  const declaredCount = touches.filter((t) => t.evidenceClass === "Declared").length;
  const unspecifiedCount = touches.filter((t) => t.objectApiName === UNSPECIFIED_OBJECT).length;

  lines.push("### Method note");
  lines.push("");
  lines.push(
    `_Every connection above comes from a field an inspector already returns for this org -- Twin Field object pairs, custom field object assignments, Product Rule scope, Discount Schedule product links, and each inspector's own known query scope. ${plural(declaredCount, "connection is", "connections are")} marked Declared: Price Rules and Custom Scripts have no per-record object reference in this org's data, so their Quote/Quote Line connection reflects documented CPQ architecture rather than a query result._`
  );
  lines.push("");
  lines.push(
    `_${plural(unspecifiedCount, "connection")} could not be attributed to a specific object -- Custom Automation and Reporting Impact only confirm an "SBQQ" substring match somewhere in a component's source or definition, not which object it touches, so those are grouped under "${UNSPECIFIED_OBJECT}" rather than assigned a specific (and fabricated) target. This is not yet a full dependency graph: it has no MetadataComponentDependency traversal, no formula/Flow parsing, and no confidence-weighted edges -- it is a first-pass, evidence-only cross-reference._`
  );

  return lines.join("\n");
}
