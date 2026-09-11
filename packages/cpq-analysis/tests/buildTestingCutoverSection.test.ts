import { describe, it, expect } from "vitest";
import { buildTestingCutoverSection } from "../src/report/buildTestingCutoverSection";
import type { AssessmentItem } from "../src/report/assessmentTypes";

function item(overrides: Partial<AssessmentItem> & Pick<AssessmentItem, "id" | "dimension" | "disposition" | "risk">): AssessmentItem {
  return {
    name: overrides.id,
    businessIntent: "Test item.",
    suggestedTarget: "N/A",
    currentComplexity: "Low",
    targetComplexity: "Low",
    confidence: "Medium",
    evidenceClass: "Observed",
    recommendation: "Test recommendation.",
    dependencies: [],
    ...overrides,
  };
}

describe("buildTestingCutoverSection", () => {
  it("excludes RETIRE items from scenario generation", () => {
    const items = [item({ id: "a", dimension: "pricing", disposition: "RETIRE", risk: "N/A" })];
    const section = buildTestingCutoverSection(items);
    expect(section).toContain("No regression scenario candidates were generated");
  });

  it("generates one scenario per non-RETIRE item, sorted highest risk first", () => {
    const items = [
      item({ id: "low-risk", dimension: "pricing", disposition: "TRANSFORM", risk: "Low", name: "Low Risk Item" } as any),
      item({ id: "high-risk", dimension: "customDevelopment", disposition: "REDESIGN", risk: "High", name: "High Risk Item" } as any),
    ];
    const section = buildTestingCutoverSection(items);
    const highIndex = section.indexOf("High Risk Item");
    const lowIndex = section.indexOf("Low Risk Item");
    expect(highIndex).toBeGreaterThan(-1);
    expect(lowIndex).toBeGreaterThan(-1);
    expect(highIndex).toBeLessThan(lowIndex);
    expect(section).toContain("| High |");
    expect(section).toContain("| Low |");
  });

  it("always renders the fixed cutover/coexistence checklist regardless of item data", () => {
    const section = buildTestingCutoverSection([]);
    expect(section).toContain("coexistence plan is documented");
    expect(section).toContain("rollback plan exists");
  });

  it("never claims scenarios have been executed", () => {
    const items = [item({ id: "a", dimension: "pricing", disposition: "TRANSFORM", risk: "Medium" })];
    const section = buildTestingCutoverSection(items);
    expect(section).toContain("candidate\" means untested");
  });
});
