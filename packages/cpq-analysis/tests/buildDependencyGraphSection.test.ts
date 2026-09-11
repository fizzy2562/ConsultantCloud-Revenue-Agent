import { describe, it, expect } from "vitest";
import { buildDependencyGraphSection } from "../src/report/buildDependencyGraphSection";
import type { AssessmentItem } from "../src/report/assessmentTypes";
import type { InspectorResult } from "../src/report/buildInventorySection";

function item(overrides: Partial<AssessmentItem> & Pick<AssessmentItem, "id" | "dimension" | "disposition">): AssessmentItem {
  return {
    name: overrides.id,
    businessIntent: "Test item.",
    suggestedTarget: "N/A",
    currentComplexity: "Low",
    targetComplexity: "Low",
    risk: "Low",
    confidence: "Medium",
    evidenceClass: "Observed",
    recommendation: "Test recommendation.",
    dependencies: [],
    ...overrides,
  };
}

function ok(data: unknown): InspectorResult {
  return { ok: true, data, meta: {} };
}

describe("buildDependencyGraphSection", () => {
  it("reports no relationships when no items are assessed", () => {
    const section = buildDependencyGraphSection({}, []);
    expect(section).toContain("No cross-category object relationships could be derived");
  });

  it("derives object touches from Twin Fields' real sourceObject/destinationObject pairs", () => {
    const items = [item({ id: "twin-fields", dimension: "dataMigrationQuality", disposition: "TRANSFORM", name: "Twin Fields" })];
    const raw = {
      detect_twin_fields: ok({
        twinFieldPairs: [{ sourceObject: "Product2", destinationObject: "SBQQ__QuoteLine__c" }],
      }),
    };
    const section = buildDependencyGraphSection(raw, items);
    expect(section).toContain("Product2");
    expect(section).toContain("SBQQ__QuoteLine__c");
    expect(section).toContain("Twin Fields");
  });

  it("only pushes a touch for an item that is actually in the assessed items list", () => {
    // detect_twin_fields data exists, but no "twin-fields" AssessmentItem was produced (e.g. the
    // report layer chose not to include it) -- the touch must not appear, since it would
    // reference a disposition item the report never actually shows.
    const raw = {
      detect_twin_fields: ok({ twinFieldPairs: [{ sourceObject: "Product2", destinationObject: "SBQQ__QuoteLine__c" }] }),
    };
    const section = buildDependencyGraphSection(raw, []);
    expect(section).toContain("No cross-category object relationships could be derived");
  });

  it("marks Price Rules and Custom Scripts as Declared (architectural fact), not Observed from data", () => {
    const items = [
      item({ id: "price-rules", dimension: "pricing", disposition: "TRANSFORM", name: "Price Rules" }),
      item({ id: "custom-scripts", dimension: "customDevelopment", disposition: "REDESIGN", name: "Quote Calculator Plugin" }),
    ];
    const raw = {
      inspect_price_rules: ok({ priceRules: [{ id: "a1" }] }),
      inspect_custom_scripts: ok({ customScripts: [{ id: "s1" }] }),
    };
    const section = buildDependencyGraphSection(raw, items);
    expect(section).toContain("Declared");
    expect(section).toMatch(/connections? (is|are) marked Declared/);
  });

  it("identifies items that share an object as unable to be sequenced independently", () => {
    const items = [
      item({ id: "catalog-structure", dimension: "catalogSellingModels", disposition: "TRANSFORM", name: "Catalog Structure" }),
      item({ id: "selling-model-readiness", dimension: "catalogSellingModels", disposition: "INVESTIGATE", name: "Selling Model Readiness" }),
    ];
    const raw = {
      inspect_catalog_structure: ok({ products: [{ id: "p1" }] }),
      inspect_selling_model: ok({ counts: { productsClassified: 1 } }),
    };
    const section = buildDependencyGraphSection(raw, items);
    expect(section).toContain("### Items that cannot be sequenced independently");
    expect(section).toContain("Product2");
    expect(section).toContain("Catalog Structure");
    expect(section).toContain("Selling Model Readiness");
  });

  it("buckets Custom Automation and Reporting Impact references under the unspecified-object bucket rather than fabricating a specific object", () => {
    const items = [
      item({ id: "automation-scan", dimension: "customDevelopment", disposition: "REDESIGN", name: "Custom Automation" }),
      item({ id: "reporting-impact", dimension: "reportingSecurityOps", disposition: "INVESTIGATE", name: "Reporting Impact" }),
    ];
    const raw = {
      inspect_automation_scanner: ok({ customApexComponents: [{ referencesSbqq: true }] }),
      inspect_reporting_impact: ok({ counts: { reportsReferencingSbqq: 1, dashboardsReferencingSbqq: 0 } }),
    };
    const section = buildDependencyGraphSection(raw, items);
    expect(section).toContain("unspecified object");
    expect(section).not.toContain("### Items that cannot be sequenced independently\n\n- **CPQ data");
  });

  it("does not push an automation touch when no custom component actually references SBQQ", () => {
    const items = [item({ id: "automation-scan", dimension: "customDevelopment", disposition: "RETIRE", name: "Custom Automation" })];
    const raw = {
      inspect_automation_scanner: ok({ customApexComponents: [{ referencesSbqq: false }] }),
    };
    const section = buildDependencyGraphSection(raw, items);
    expect(section).toContain("No cross-category object relationships could be derived");
  });
});
