import { describe, it, expect } from "vitest";
import { buildReadinessScore } from "../src/report/buildReadinessScore";
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

function okRaw(): Record<string, InspectorResult> {
  return {
    inspect_price_rules: { ok: true, data: {}, meta: {} },
    inspect_discount_schedules: { ok: true, data: {}, meta: {} },
  };
}

describe("buildReadinessScore", () => {
  it("scores a dimension with no items as Unknown (null), excluded from the readiness average", () => {
    const result = buildReadinessScore([], okRaw());
    const installedBase = result.dimensions.find((d) => d.id === "installedBaseLifecycle");
    expect(installedBase?.score).toBeNull();
    expect(installedBase?.itemCount).toBe(0);
    expect(result.overallReadiness).toBeNull();
  });

  it("computes a dimension score as the average of fixed disposition points", () => {
    const items = [
      item({ id: "a", dimension: "pricing", disposition: "DIRECT" }), // 100
      item({ id: "b", dimension: "pricing", disposition: "TRANSFORM" }), // 70
    ];
    const result = buildReadinessScore(items, okRaw());
    const pricing = result.dimensions.find((d) => d.id === "pricing");
    expect(pricing?.score).toBe(85);
    expect(pricing?.itemCount).toBe(2);
  });

  it("excludes BLOCKED items from being scored above zero and pulls the dimension average down", () => {
    const items = [
      item({ id: "a", dimension: "customDevelopment", disposition: "BLOCKED" }),
      item({ id: "b", dimension: "customDevelopment", disposition: "REDESIGN" }), // 40
    ];
    const result = buildReadinessScore(items, okRaw());
    const custom = result.dimensions.find((d) => d.id === "customDevelopment");
    expect(custom?.score).toBe(20);
  });

  it("computes coverage as the weight-weighted sum of fixed evidenceCompleteness across all nine dimensions", () => {
    const result = buildReadinessScore([], okRaw());
    // Sum(weight * completeness) matches the fixed table: catalog 12*0.75 + pricing 13*0.6 +
    // configRules 10*0.7 + customDev 15*0.6 + installedBase 15*0.45 + integrations 10*0.35 +
    // dataMigration 10*0.45 + reporting 7*0.25 + testing 8*0 = 9+7.8+7+9+6.75+3.5+4.5+1.75+0 = 49.3
    expect(result.coveragePercent).toBeCloseTo(49.3, 1);
  });

  it("marks the score provisional when coverage is below 70%, regardless of item data", () => {
    const items = [item({ id: "a", dimension: "pricing", disposition: "DIRECT" })];
    const result = buildReadinessScore(items, okRaw());
    expect(result.isProvisional).toBe(true);
  });

  it("marks the score provisional when any inspector failed, even with full item coverage", () => {
    const raw: Record<string, InspectorResult> = {
      inspect_price_rules: { ok: false, error: { code: "SALESFORCE_ERROR", message: "boom", retryable: true }, meta: {} },
    };
    const result = buildReadinessScore([], raw);
    expect(result.isProvisional).toBe(true);
  });

  it("counts items by disposition across all dimensions", () => {
    const items = [
      item({ id: "a", dimension: "pricing", disposition: "DIRECT" }),
      item({ id: "b", dimension: "configurationRules", disposition: "DIRECT" }),
      item({ id: "c", dimension: "customDevelopment", disposition: "REDESIGN" }),
    ];
    const result = buildReadinessScore(items, okRaw());
    expect(result.dispositionCounts.DIRECT).toBe(2);
    expect(result.dispositionCounts.REDESIGN).toBe(1);
    expect(result.dispositionCounts.TRANSFORM).toBe(0);
  });
});
