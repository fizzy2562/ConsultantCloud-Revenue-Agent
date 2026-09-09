import { describe, it, expect, vi } from "vitest";
import type { Connection } from "jsforce";
import { inspectPriceRulesHandler } from "../src/inspectors/inspectPriceRules";
import { inspectCustomScriptsHandler } from "../src/inspectors/inspectCustomScripts";
import { detectTwinFieldsHandler } from "../src/inspectors/detectTwinFields";

function connectionWithQueries(...responses: Array<{ records: any[] }>) {
  const query = vi.fn();
  for (const response of responses) query.mockResolvedValueOnce(response);
  return { query } as unknown as Connection;
}

function connectionWithDescribes(byObject: Record<string, { fields: Array<{ name: string; type: string; label: string }> }>) {
  const describe = vi.fn((sobject: string) => Promise.resolve(byObject[sobject] ?? { fields: [] }));
  return { describe } as unknown as Connection;
}

describe("inspectPriceRulesHandler", () => {
  it("groups conditions and actions under their parent rule", async () => {
    const conn = connectionWithQueries(
      { records: [{ Id: "a01", Name: "Enterprise Discount Rule", SBQQ__Active__c: true, SBQQ__ConditionsMet__c: "All", SBQQ__EvaluationEvent__c: "Save", SBQQ__TargetObject__c: "SBQQ__QuoteLine__c", SBQQ__Product__c: "01t000000000001" }] },
      { records: [{ Id: "c01", SBQQ__Rule__c: "a01", SBQQ__Object__c: "SBQQ__Quote__c", SBQQ__Field__c: "SBQQ__NetAmount__c", SBQQ__Operator__c: "Greater Than", SBQQ__FilterType__c: "Value", SBQQ__Value__c: "10000", SBQQ__Index__c: 0 }] },
      { records: [{ Id: "ac01", SBQQ__Rule__c: "a01", SBQQ__TargetObject__c: "SBQQ__QuoteLine__c", SBQQ__Field__c: "SBQQ__CustomerPrice__c", SBQQ__Value__c: "0.9 * {SBQQ__ListPrice__c}", SBQQ__Order__c: 0 }] }
    );

    const result = await inspectPriceRulesHandler(conn, {});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.priceRules).toHaveLength(1);
    const rule = result.data.priceRules[0]!;
    expect(rule.id).toBe("a01");
    expect(rule.active).toBe(true);
    expect(rule.conditions).toHaveLength(1);
    expect(rule.conditions[0]!.field).toBe("SBQQ__NetAmount__c");
    expect(rule.actions).toHaveLength(1);
    expect(rule.actions[0]!.field).toBe("SBQQ__CustomerPrice__c");
  });

  it("returns an empty result and skips child queries when there are no price rules", async () => {
    const query = vi.fn().mockResolvedValueOnce({ records: [] });
    const conn = { query } as unknown as Connection;

    const result = await inspectPriceRulesHandler(conn, {});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.priceRules).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe("inspectCustomScriptsHandler", () => {
  it("truncates the code preview to 500 characters and reports the full length", async () => {
    const longCode = "x".repeat(1200);
    const conn = connectionWithQueries({
      records: [{ Id: "cs01", Name: "Custom Calculator", SBQQ__Code__c: longCode }],
    });

    const result = await inspectCustomScriptsHandler(conn, {});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.customScripts).toHaveLength(1);
    const script = result.data.customScripts[0]!;
    expect(script.codeLength).toBe(1200);
    expect(script.codePreview).toHaveLength(500);
    expect(script.codePreview).toBe(longCode.slice(0, 500));
  });
});

describe("detectTwinFieldsHandler", () => {
  it("finds only custom, non-managed fields with matching name and type across source/destination pairs", async () => {
    const conn = connectionWithDescribes({
      Product2: {
        fields: [
          { name: "Warranty_Months__c", type: "double", label: "Warranty (Months)" },
          { name: "SBQQ__SubscriptionType__c", type: "picklist", label: "Subscription Type" },
          { name: "Only_On_Product__c", type: "string", label: "Only On Product" },
        ],
      },
      SBQQ__ProductOption__c: { fields: [] },
      SBQQ__ConfigurationAttribute__c: { fields: [] },
      SBQQ__QuoteLine__c: {
        fields: [
          { name: "Warranty_Months__c", type: "double", label: "Warranty (Months)" },
          { name: "Committed_Quantity__c", type: "double", label: "Committed Quantity" },
          { name: "SBQQ__SubscriptionType__c", type: "picklist", label: "Subscription Type" },
          { name: "Mismatched_Type__c", type: "string", label: "Mismatched Type" },
        ],
      },
      SBQQ__Subscription__c: {
        fields: [{ name: "Committed_Quantity__c", type: "double", label: "Committed Quantity" }],
      },
    });

    const result = await detectTwinFieldsHandler(conn, {});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pairs = result.data.twinFieldPairs;

    expect(pairs).toContainEqual({
      sourceObject: "Product2",
      destinationObject: "SBQQ__QuoteLine__c",
      fieldName: "Warranty_Months__c",
      fieldType: "double",
      fieldLabel: "Warranty (Months)",
    });

    // Managed (SBQQ__-prefixed) fields must never be reported, even when identical on both sides.
    expect(pairs.find((p) => p.fieldName === "SBQQ__SubscriptionType__c")).toBeUndefined();

    // A field present on only one side is not a twin field.
    expect(pairs.find((p) => p.fieldName === "Only_On_Product__c")).toBeUndefined();

    // A field with mismatched type must not be reported.
    expect(pairs.find((p) => p.fieldName === "Mismatched_Type__c")).toBeUndefined();

    // Quote Line is itself a valid Twin Field source (e.g. into Subscription for committed-quantity
    // enforcement), not just a destination, so this real-world pair must be detected.
    expect(pairs).toContainEqual({
      sourceObject: "SBQQ__QuoteLine__c",
      destinationObject: "SBQQ__Subscription__c",
      fieldName: "Committed_Quantity__c",
      fieldType: "double",
      fieldLabel: "Committed Quantity",
    });

    // Quote Line must never be paired with itself.
    expect(pairs.find((p) => p.sourceObject === p.destinationObject)).toBeUndefined();
  });
});
