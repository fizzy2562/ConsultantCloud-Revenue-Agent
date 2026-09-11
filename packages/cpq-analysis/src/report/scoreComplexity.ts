export type InspectorResult =
  | { ok: true; data: unknown; meta?: unknown }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta?: unknown };

interface InspectPriceRulesData {
  priceRules: Array<{
    id: string;
    name: string;
    active: boolean;
    conditionsMet: string | null;
    evaluationEvent: string | null;
    targetObject: string | null;
    product: string | null;
    conditions: Array<{
      id: string;
      ruleId: string | null;
      object: string | null;
      field: string | null;
      operator: string | null;
      filterType: string | null;
      value: string | null;
      index: number | null;
    }>;
    actions: Array<{
      id: string;
      ruleId: string | null;
      targetObject: string | null;
      field: string | null;
      value: string | null;
      order: number | null;
    }>;
  }>;
}

interface InspectDiscountSchedulesData {
  discountSchedules: Array<{ id: string; name: string; type: string | null; discountUnit: string | null; product: string | null; description: string | null; tiers: unknown[] }>;
}

interface InspectProductRulesData {
  productRules: Array<{
    id: string;
    name: string;
    active: boolean;
    type: string | null;
    scope: string | null;
    evaluationEvent: string | null;
    errorMessage: string | null;
    configurationRules: unknown[];
  }>;
}

interface InspectCustomScriptsData {
  customScripts: Array<{ id: string; name: string; codeLength: number; codePreview: string }>;
}

interface InspectCatalogStructureData {
  products: unknown[];
  productOptions: unknown[];
  productFeatures: unknown[];
  attributeSets: Array<{ id: string; name: string }>;
  configurationAttributes: Array<{ id: string; name: string }>;
}

interface DetectTwinFieldsData {
  twinFieldPairs: Array<{ sourceObject: string; destinationObject: string; fieldName: string; fieldType: string; fieldLabel: string }>;
}

interface ScoredItem {
  name: string;
  complexity: string;
  risk: string;
  rationale: string;
}

function riskTier(risk: string): number {
  if (risk === "High") return 3;
  if (risk === "Medium-High") return 2;
  if (risk === "Medium") return 1;
  return 0;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function failureRationale(result: InspectorResult | undefined): string {
  if (result && !result.ok) return `Inspector failed: ${result.error.message}`;
  return "No data returned for this inspector.";
}

export function scoreComplexity(raw: Record<string, InspectorResult>): string {
  const items: ScoredItem[] = [];

  // Custom Scripts
  const scriptsResult = raw["inspect_custom_scripts"];
  if (scriptsResult && scriptsResult.ok) {
    const data = scriptsResult.data as InspectCustomScriptsData;
    const scripts = data.customScripts ?? [];
    if (scripts.length > 0) {
      items.push({
        name: "Quote Calculator Plugin",
        complexity: "High",
        risk: "High",
        rationale:
          "No Revenue Cloud object equivalent; must be re-implemented as CalculationProcedureStep formulas or an Apex-backed pricing callout.",
      });
    } else {
      items.push({
        name: "Quote Calculator Plugin",
        complexity: "N/A",
        risk: "N/A",
        rationale: "No custom pricing logic found.",
      });
    }
  } else {
    items.push({
      name: "Quote Calculator Plugin",
      complexity: "N/A",
      risk: "N/A",
      rationale: scriptsResult ? failureRationale(scriptsResult) : "No custom pricing logic found.",
    });
  }

  // Twin Fields
  const twinResult = raw["detect_twin_fields"];
  if (twinResult && twinResult.ok) {
    const data = twinResult.data as DetectTwinFieldsData;
    const pairs = data.twinFieldPairs ?? [];
    if (pairs.length > 0) {
      items.push({
        name: "Twin Fields",
        complexity: "Low",
        risk: "Medium-High",
        rationale:
          "Mechanically simple to migrate (one Field Mapping record per pair) but invisible to any tool that only inspects explicit relationships -- must be actively searched for, not assumed absent.",
      });
    } else {
      items.push({
        name: "Twin Fields",
        complexity: "N/A",
        risk: "Low",
        rationale: "No twin fields found.",
      });
    }
  } else {
    items.push({
      name: "Twin Fields",
      complexity: "N/A",
      risk: "Low",
      rationale: twinResult ? failureRationale(twinResult) : "No twin fields found.",
    });
  }

  // Product Rules
  const productRulesResult = raw["inspect_product_rules"];
  if (productRulesResult && productRulesResult.ok) {
    const data = productRulesResult.data as InspectProductRulesData;
    const rules = data.productRules ?? [];
    if (rules.length > 0) {
      // Group by scope
      const scopeGroups = new Map<string, typeof rules>();
      for (const rule of rules) {
        const scope = rule.scope ?? "Unknown";
        const existing = scopeGroups.get(scope);
        if (existing) {
          existing.push(rule);
        } else {
          scopeGroups.set(scope, [rule]);
        }
      }

      for (const [scope, groupRules] of scopeGroups) {
        const isProductScope = scope === "Product";
        const complexity = isProductScope ? "Low" : "Medium";
        const risk = isProductScope ? "Low" : "Medium-High";
        const rationale = isProductScope
          ? "Direct mapping to ProductConfigurationRule."
          : "No direct Revenue Cloud object for quote-level validation; typically requires a CalculationProcedureStep, DecisionTable, or Apex validation.";

        if (groupRules.length > 5) {
          items.push({
            name: `Product Rules (${scope} scope, ${groupRules.length} rules)`,
            complexity,
            risk,
            rationale,
          });
        } else {
          for (const rule of groupRules) {
            items.push({
              name: rule.name,
              complexity,
              risk,
              rationale,
            });
          }
        }
      }
    }
  } else if (productRulesResult && !productRulesResult.ok) {
    items.push({
      name: "Product Rules",
      complexity: "N/A",
      risk: "N/A",
      rationale: failureRationale(productRulesResult),
    });
  }

  // Discount Schedules
  const discountResult = raw["inspect_discount_schedules"];
  if (discountResult && discountResult.ok) {
    const data = discountResult.data as InspectDiscountSchedulesData;
    const schedules = data.discountSchedules ?? [];
    if (schedules.length > 0) {
      items.push({
        name: "Discount Schedules",
        complexity: "Low",
        risk: "Low",
        rationale: "Near-direct structural match to PriceAdjustmentSchedule/PriceAdjustmentTier.",
      });
    } else {
      items.push({
        name: "Discount Schedules",
        complexity: "N/A",
        risk: "N/A",
        rationale: "No discount schedules found.",
      });
    }
  } else {
    items.push({
      name: "Discount Schedules",
      complexity: "N/A",
      risk: "N/A",
      rationale: discountResult ? failureRationale(discountResult) : "No discount schedules found.",
    });
  }

  // Price Rules
  const priceRulesResult = raw["inspect_price_rules"];
  if (priceRulesResult && priceRulesResult.ok) {
    const data = priceRulesResult.data as InspectPriceRulesData;
    const rules = data.priceRules ?? [];
    if (rules.length === 0) {
      items.push({
        name: "Price Rules",
        complexity: "N/A",
        risk: "N/A",
        rationale: "No Price Rules found.",
      });
    } else {
      const totalConditionsAndActions = rules.reduce(
        (sum, rule) => sum + rule.conditions.length + rule.actions.length,
        0
      );
      const average = totalConditionsAndActions / rules.length;
      const roundedAverage = Math.round(average * 10) / 10;

      let complexity: string;
      if (average <= 2) {
        complexity = "Low";
      } else if (average <= 5) {
        complexity = "Medium";
      } else {
        complexity = "High";
      }

      const risk = complexity;
      const rationale = `${rules.length} rules, average ${roundedAverage.toFixed(1)} conditions+actions per rule.`;

      items.push({
        name: "Price Rules",
        complexity,
        risk,
        rationale,
      });
    }
  } else {
    items.push({
      name: "Price Rules",
      complexity: "N/A",
      risk: "N/A",
      rationale: priceRulesResult ? failureRationale(priceRulesResult) : "No Price Rules found.",
    });
  }

  // Catalog Structure
  const catalogResult = raw["inspect_catalog_structure"];
  if (catalogResult && catalogResult.ok) {
    const data = catalogResult.data as InspectCatalogStructureData;
    const configAttrs = data.configurationAttributes ?? [];
    const attrSets = data.attributeSets ?? [];
    const productOptions = data.productOptions ?? [];
    // The productOptions > 200 risk override is independent of which complexity branch applies below.
    const highOptionVolume = productOptions.length > 200;
    const risk = highOptionVolume ? "Medium" : "Low";
    const riskRationaleSuffix = highOptionVolume
      ? " High option volume increases data-entry/QA burden during bundle re-creation."
      : "";

    if (configAttrs.length === 0 && attrSets.length === 0) {
      items.push({
        name: "Catalog Structure",
        complexity: "Low",
        risk,
        rationale: `No attribute-based configuration to carry over.${riskRationaleSuffix}`,
      });
    } else {
      items.push({
        name: "Catalog Structure",
        complexity: "Medium",
        risk,
        rationale: `${configAttrs.length} configuration attributes require ProductAttributeDefinition mapping.${riskRationaleSuffix}`,
      });
    }
  } else if (catalogResult && !catalogResult.ok) {
    items.push({
      name: "Catalog Structure",
      complexity: "N/A",
      risk: "N/A",
      rationale: failureRationale(catalogResult),
    });
  }

  // Build the table
  const lines: string[] = [];
  lines.push("## Complexity / risk scoring");
  lines.push("");
  lines.push("| Item | Complexity | Risk | Rationale |");
  lines.push("|---|---|---|---|");

  for (const item of items) {
    lines.push(
      `| ${escapeCell(item.name)} | ${item.complexity} | ${item.risk} | ${escapeCell(item.rationale)} |`
    );
  }

  // Overall risk
  const allRisks = items.map((item) => item.risk);
  const hasHigh = allRisks.includes("High");
  const hasMediumOrMediumHigh = allRisks.some(
    (r) => r === "Medium" || r === "Medium-High"
  );

  let overallRisk: string;
  if (hasHigh) {
    overallRisk = "High";
  } else if (hasMediumOrMediumHigh) {
    overallRisk = "Medium";
  } else {
    overallRisk = "Low";
  }

  lines.push("");
  lines.push(`**Overall risk: ${overallRisk}**`);

  // Top 1-2 highest-risk items by name
  const ranked = items
    .filter((item) => item.risk !== "N/A")
    .sort((a, b) => riskTier(b.risk) - riskTier(a.risk));

  const topItems = ranked.slice(0, 2);
  if (topItems.length > 0) {
    const topDescriptions = topItems.map((item) => `${item.name} (${item.risk})`);
    lines.push(`Highest-risk items: ${topDescriptions.join(" and ")}.`);
  }

  return lines.join("\n");
}
