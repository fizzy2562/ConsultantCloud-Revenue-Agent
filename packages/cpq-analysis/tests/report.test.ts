import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildInventorySection, type InspectorResult } from "../src/report/buildInventorySection";
import { scoreComplexity } from "../src/report/scoreComplexity";
import { buildSequencingSection } from "../src/report/buildSequencingSection";
import { assembleReport } from "../src/report/assembleReport";

function ok(data: unknown): InspectorResult {
  return { ok: true, data, meta: { requestId: "req-1", durationMs: 1, source: "salesforce" } };
}

function fail(message: string): InspectorResult {
  return { ok: false, error: { code: "SALESFORCE_ERROR", message, retryable: true }, meta: { requestId: "req-1", durationMs: 1, source: "salesforce" } };
}

// A representative fixture roughly matching the shape of the hand-written reference report:
// one Price Rule, one Discount Schedule (3 tiers), a Product-scoped and a Quote-scoped Product
// Rule, one Custom Script, a small catalog, and two Twin Field pairs.
function fullFixture(): Record<string, InspectorResult> {
  return {
    inspect_price_rules: ok({
      priceRules: [
        {
          id: "a01000000000001",
          name: "Enterprise Discount Rule",
          active: true,
          conditionsMet: "All",
          evaluationEvent: "Save",
          targetObject: "SBQQ__QuoteLine__c",
          product: null,
          conditions: [
            { id: "c01", ruleId: "a01000000000001", object: "SBQQ__Quote__c", field: "SBQQ__NetAmount__c", operator: "Greater Than", filterType: "Value", value: "10000", index: 0 },
          ],
          actions: [
            { id: "ac01", ruleId: "a01000000000001", targetObject: "SBQQ__QuoteLine__c", field: "SBQQ__CustomerPrice__c", value: "0.9 * {SBQQ__ListPrice__c}", order: 0 },
          ],
        },
      ],
    }),
    inspect_discount_schedules: ok({
      discountSchedules: [
        {
          id: "b01000000000001",
          name: "Volume Discount Schedule",
          type: "Range",
          discountUnit: "Percent",
          product: null,
          description: "Tiered volume discount",
          tiers: [
            { id: "t1", scheduleId: "b01000000000001", name: "Tier 1", number: 1, lowerBound: 0, upperBound: 10, discount: 5, discountAmount: null, price: null },
            { id: "t2", scheduleId: "b01000000000001", name: "Tier 2", number: 2, lowerBound: 10, upperBound: 50, discount: 10, discountAmount: null, price: null },
            { id: "t3", scheduleId: "b01000000000001", name: "Tier 3", number: 3, lowerBound: 50, upperBound: null, discount: 15, discountAmount: null, price: null },
          ],
        },
      ],
    }),
    inspect_product_rules: ok({
      productRules: [
        {
          id: "d01000000000001",
          name: "Bundle Validation Rule",
          active: true,
          type: "Validation",
          scope: "Product",
          evaluationEvent: "Save",
          errorMessage: "Select at least one option",
          configurationRules: [{ id: "cr1", productRuleId: "d01000000000001", active: true, product: "Widget Bundle", productFeature: "Core Options" }],
        },
        {
          id: "d01000000000002",
          name: "Minimum License Enforcement",
          active: true,
          type: "Validation",
          scope: "Quote",
          evaluationEvent: "Save",
          errorMessage: "Minimum license count not met",
          configurationRules: [],
        },
      ],
    }),
    inspect_custom_scripts: ok({
      customScripts: [
        { id: "e01000000000001", name: "Custom Pricing Calculator", codeLength: 781, codePreview: "function calculate(quote) { /* ... */ }" },
      ],
    }),
    inspect_catalog_structure: ok({
      products: [
        { id: "p1", name: "Widget Bundle", productCode: "WB-100", family: "Bundles", isActive: true },
        { id: "p2", name: "Widget Add-On", productCode: "WB-200", family: "Options", isActive: true },
      ],
      productOptions: [
        { id: "o1", name: "Extra Widget", configuredSku: "WB-100", optionalSku: "WB-200", feature: "Core Options", type: "Optional", required: false, minQuantity: 0, maxQuantity: 5 },
      ],
      productFeatures: [{ id: "f1", name: "Core Options", configuredSku: "WB-100", minOptionCount: 0, maxOptionCount: 3, optionSelectionMethod: "Click" }],
      attributeSets: [],
      configurationAttributes: [],
    }),
    detect_twin_fields: ok({
      twinFieldPairs: [
        { sourceObject: "Product2", destinationObject: "SBQQ__QuoteLine__c", fieldName: "Warranty_Months__c", fieldType: "double", fieldLabel: "Warranty (Months)" },
        { sourceObject: "SBQQ__QuoteLine__c", destinationObject: "SBQQ__Subscription__c", fieldName: "Committed_Quantity__c", fieldType: "double", fieldLabel: "Committed Quantity" },
      ],
    }),
  };
}

describe("scoreComplexity", () => {
  it("scores custom scripts High/High when present", () => {
    const raw = fullFixture();
    const table = scoreComplexity(raw);
    expect(table).toMatch(/\| Quote Calculator Plugin \| High \| High \|/);
  });

  it("scores custom scripts N/A/N/A when absent", () => {
    const raw = fullFixture();
    raw.inspect_custom_scripts = ok({ customScripts: [] });
    const table = scoreComplexity(raw);
    expect(table).toMatch(/\| Quote Calculator Plugin \| N\/A \| N\/A \|/);
  });

  it("scores twin fields Low/Medium-High when present, N/A/Low when absent", () => {
    const withPairs = scoreComplexity(fullFixture());
    expect(withPairs).toMatch(/\| Twin Fields \| Low \| Medium-High \|/);

    const raw = fullFixture();
    raw.detect_twin_fields = ok({ twinFieldPairs: [] });
    const withoutPairs = scoreComplexity(raw);
    expect(withoutPairs).toMatch(/\| Twin Fields \| N\/A \| Low \|/);
  });

  it("scores a Product-scoped Product Rule Low/Low", () => {
    const raw: Record<string, InspectorResult> = {
      inspect_product_rules: ok({
        productRules: [
          { id: "r1", name: "Bundle Validation Rule", active: true, type: "Validation", scope: "Product", evaluationEvent: "Save", errorMessage: null, configurationRules: [] },
        ],
      }),
    };
    const table = scoreComplexity(raw);
    expect(table).toMatch(/\| Bundle Validation Rule \| Low \| Low \|/);
  });

  it("scores a Quote-scoped Product Rule Medium/Medium-High, not Low", () => {
    const raw: Record<string, InspectorResult> = {
      inspect_product_rules: ok({
        productRules: [
          { id: "r2", name: "Minimum License Enforcement", active: true, type: "Validation", scope: "Quote", evaluationEvent: "Save", errorMessage: null, configurationRules: [] },
        ],
      }),
    };
    const table = scoreComplexity(raw);
    expect(table).toMatch(/\| Minimum License Enforcement \| Medium \| Medium-High \|/);
    expect(table).not.toMatch(/\| Minimum License Enforcement \| Low \|/);
  });

  it("scores discount schedules Low/Low when present, N/A when absent", () => {
    const withSchedules = scoreComplexity(fullFixture());
    expect(withSchedules).toMatch(/\| Discount Schedules \| Low \| Low \|/);

    const raw = fullFixture();
    raw.inspect_discount_schedules = ok({ discountSchedules: [] });
    const withoutSchedules = scoreComplexity(raw);
    expect(withoutSchedules).toMatch(/\| Discount Schedules \| N\/A \| N\/A \|/);
  });

  it("scores Price Rules by average conditions+actions per rule (Low <= 2, Medium <= 5, High > 5)", () => {
    function ruleWith(conditionCount: number, actionCount: number, id: string) {
      return {
        id,
        name: `Rule ${id}`,
        active: true,
        conditionsMet: "All",
        evaluationEvent: "Save",
        targetObject: null,
        product: null,
        conditions: Array.from({ length: conditionCount }, (_, i) => ({ id: `${id}-c${i}`, ruleId: id, object: null, field: null, operator: null, filterType: null, value: null, index: i })),
        actions: Array.from({ length: actionCount }, (_, i) => ({ id: `${id}-a${i}`, ruleId: id, targetObject: null, field: null, value: null, order: i })),
      };
    }

    const low = scoreComplexity({ inspect_price_rules: ok({ priceRules: [ruleWith(1, 1, "r1")] }) });
    expect(low).toMatch(/\| Price Rules \| Low \| Low \|/);

    const medium = scoreComplexity({ inspect_price_rules: ok({ priceRules: [ruleWith(3, 2, "r1")] }) });
    expect(medium).toMatch(/\| Price Rules \| Medium \| Medium \|/);

    const high = scoreComplexity({ inspect_price_rules: ok({ priceRules: [ruleWith(4, 4, "r1")] }) });
    expect(high).toMatch(/\| Price Rules \| High \| High \|/);

    const none = scoreComplexity({ inspect_price_rules: ok({ priceRules: [] }) });
    expect(none).toMatch(/\| Price Rules \| N\/A \| N\/A \|/);
  });

  it("scores catalog structure Low with no attribute-based configuration, Medium when configuration attributes exist", () => {
    const noAttrs = scoreComplexity({
      inspect_catalog_structure: ok({ products: [], productOptions: [], productFeatures: [], attributeSets: [], configurationAttributes: [] }),
    });
    expect(noAttrs).toMatch(/\| Catalog Structure \| Low \| Low \|/);

    const withAttrs = scoreComplexity({
      inspect_catalog_structure: ok({
        products: [],
        productOptions: [],
        productFeatures: [],
        attributeSets: [{ id: "as1", name: "Set 1" }],
        configurationAttributes: [{ id: "ca1", name: "Attr 1" }],
      }),
    });
    expect(withAttrs).toMatch(/\| Catalog Structure \| Medium \| Low \|/);
  });

  it("bumps catalog structure risk to Medium when productOptions exceed 200, even with zero attributes", () => {
    const manyOptions = Array.from({ length: 201 }, (_, i) => ({ id: `o${i}`, name: `Option ${i}` }));
    const table = scoreComplexity({
      inspect_catalog_structure: ok({ products: [], productOptions: manyOptions, productFeatures: [], attributeSets: [], configurationAttributes: [] }),
    });
    // Complexity stays Low (no attribute-based configuration), but risk must be bumped to Medium
    // by the high option-volume override -- this override is independent of the complexity branch.
    expect(table).toMatch(/\| Catalog Structure \| Low \| Medium \|/);
  });

  it("computes an overall risk line reflecting the highest risk tier present", () => {
    const table = scoreComplexity(fullFixture());
    expect(table).toMatch(/\*\*Overall risk: High\*\*/);
    expect(table).toMatch(/Highest-risk items:/);
  });

  it("handles an ok:false inspector result gracefully instead of crashing", () => {
    const raw = fullFixture();
    raw.inspect_custom_scripts = fail("INVALID_SESSION_ID");
    expect(() => scoreComplexity(raw)).not.toThrow();
  });
});

describe("buildInventorySection", () => {
  it("produces real values from the fixture, not placeholders", () => {
    const section = buildInventorySection(fullFixture());
    expect(section).toContain("Enterprise Discount Rule");
    expect(section).toContain("a01000000000001");
    expect(section).toContain("Volume Discount Schedule");
    expect(section).toContain("Bundle Validation Rule");
    expect(section).toContain("Minimum License Enforcement");
    expect(section).toContain("Custom Pricing Calculator");
    expect(section).toContain("Widget Bundle");
    expect(section).toContain("Warranty_Months__c");
    expect(section).toContain("Committed_Quantity__c");
    expect(section).not.toMatch(/Rule 1\b/);
    expect(section).not.toMatch(/placeholder/i);
  });

  it("includes the Revenue Cloud mapping mechanism for each category", () => {
    const section = buildInventorySection(fullFixture());
    expect(section).toContain("CalculationProcedure");
    expect(section).toContain("PriceAdjustmentSchedule");
    expect(section).toContain("ProductConfigurationRule");
    expect(section).toContain("Field Mapping");
  });

  it("renders multi-line script source with a fence that can't be broken by backticks in the code itself, without corrupting sections rendered after it", () => {
    const raw = fullFixture();
    // A real-world-shaped script: multiple lines, and a template literal containing a run of
    // backticks -- exactly the input that broke the old single-line, fixed-length fence.
    const trickyScript = [
      "function calculate(quote) {",
      "  const template = `some ``` nested backticks ``` here`;",
      "  return quote.total * 1.1;",
      "}",
    ].join("\n");
    raw.inspect_custom_scripts = ok({
      customScripts: [{ id: "cs01", name: "Tricky Script", codeLength: trickyScript.length, codePreview: trickyScript }],
    });

    const section = buildInventorySection(raw);

    // The script's own newlines must survive intact, not be flattened onto one line.
    expect(section).toContain("function calculate(quote) {");
    expect(section).toContain("  return quote.total * 1.1;");
    // Manual-review language must appear, replacing any notion of an AI-generated summary.
    expect(section).toContain("Manual review required");
    // A section that would come after Custom Scripts in the real document must still be present
    // and correctly formed -- proof the fence didn't swallow or corrupt what follows it.
    expect(section).toContain("### Catalog Structure");
    expect(section).toContain("**Revenue Cloud target:** Product2");
  });

  it("notes a failed inspector without crashing", () => {
    const raw = fullFixture();
    raw.inspect_price_rules = fail("INVALID_SESSION_ID");
    const section = buildInventorySection(raw);
    expect(section).toContain("INVALID_SESSION_ID");
  });
});

describe("buildSequencingSection", () => {
  it("skips the Discount Schedules step cleanly when there are none", () => {
    const raw = fullFixture();
    raw.inspect_discount_schedules = ok({ discountSchedules: [] });
    const section = buildSequencingSection(raw);
    expect(section).not.toContain("Discount Schedules next");
  });

  it("skips the Custom Scripts step entirely when there are none", () => {
    const raw = fullFixture();
    raw.inspect_custom_scripts = ok({ customScripts: [] });
    const section = buildSequencingSection(raw);
    expect(section.toLowerCase()).not.toContain("custom script");
  });

  it("includes the Custom Scripts step when scripts are present", () => {
    const section = buildSequencingSection(fullFixture());
    expect(section.toLowerCase()).toContain("custom script");
  });

  it("always includes the catalog-foundation and end-to-end UAT steps", () => {
    const raw: Record<string, InspectorResult> = {};
    const section = buildSequencingSection(raw);
    expect(section).toContain("Catalog and bundle structure first");
    expect(section).toContain("End-to-end UAT");
  });

  it("renumbers steps sequentially when some are skipped", () => {
    const raw: Record<string, InspectorResult> = {};
    const section = buildSequencingSection(raw);
    const stepNumbers = [...section.matchAll(/^(\d+)\.\s/gm)].map((m) => Number(m[1]));
    expect(stepNumbers).toEqual(stepNumbers.map((_, i) => i + 1));
  });
});

describe("assembleReport", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = originalFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("produces a full report with no LLM call whatsoever, even when custom scripts are present", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await assembleReport(fullFixture());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.report).toContain("Custom Pricing Calculator");
    expect(result.report).toContain("Manual review required");
    expect(result.report).toContain("# CPQ -> Revenue Cloud Migration Readiness Report");
    expect(result.report).toContain("## Object-by-object inventory");
    expect(result.report).toContain("## Complexity / risk scoring");
    expect(result.report).toContain("## Sequencing recommendation");
  });

  it("renders the raw script source in a fenced code block rather than an AI-generated summary", async () => {
    const result = await assembleReport(fullFixture());
    expect(result.report).toContain("function calculate(quote)");
  });

  it("still produces a full report when there are no custom scripts", async () => {
    const raw = fullFixture();
    raw.inspect_custom_scripts = ok({ customScripts: [] });

    const result = await assembleReport(raw);

    expect(result.report).toContain("## Object-by-object inventory");
  });
});
