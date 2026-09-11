export type InspectorResult =
  | { ok: true; data: unknown; meta?: unknown }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta?: unknown };

interface CatalogCounts {
  products: number;
  productOptions: number;
  productFeatures: number;
  attributeSets: number;
  configurationAttributes: number;
}

interface Step {
  text: string;
}

function safeArrayLength(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length;
  }
  return 0;
}

function extractCatalogCounts(raw: Record<string, InspectorResult>): CatalogCounts {
  const result = raw["inspect_catalog_structure"];
  if (!result || !result.ok) {
    return {
      products: 0,
      productOptions: 0,
      productFeatures: 0,
      attributeSets: 0,
      configurationAttributes: 0,
    };
  }

  const data = result.data as {
    products?: unknown;
    productOptions?: unknown;
    productFeatures?: unknown;
    attributeSets?: unknown;
    configurationAttributes?: unknown;
  };

  return {
    products: safeArrayLength(data.products),
    productOptions: safeArrayLength(data.productOptions),
    productFeatures: safeArrayLength(data.productFeatures),
    attributeSets: safeArrayLength(data.attributeSets),
    configurationAttributes: safeArrayLength(data.configurationAttributes),
  };
}

function extractPriceRules(raw: Record<string, InspectorResult>): number {
  const result = raw["inspect_price_rules"];
  if (!result || !result.ok) {
    return 0;
  }

  const data = result.data as { priceRules?: unknown };
  return safeArrayLength(data.priceRules);
}

function extractDiscountSchedules(raw: Record<string, InspectorResult>): number {
  const result = raw["inspect_discount_schedules"];
  if (!result || !result.ok) {
    return 0;
  }

  const data = result.data as { discountSchedules?: unknown };
  return safeArrayLength(data.discountSchedules);
}

function extractTwinFieldPairs(raw: Record<string, InspectorResult>): number {
  const result = raw["detect_twin_fields"];
  if (!result || !result.ok) {
    return 0;
  }

  const data = result.data as { twinFieldPairs?: unknown };
  return safeArrayLength(data.twinFieldPairs);
}

function extractProductRulesByScope(raw: Record<string, InspectorResult>): {
  productScoped: number;
  quoteScoped: number;
} {
  const result = raw["inspect_product_rules"];
  if (!result || !result.ok) {
    return { productScoped: 0, quoteScoped: 0 };
  }

  const data = result.data as {
    productRules?: Array<{ scope?: string | null }>;
  };

  const rules = Array.isArray(data.productRules) ? data.productRules : [];
  let productScoped = 0;
  let quoteScoped = 0;

  for (const rule of rules) {
    if (rule.scope === "Product") {
      productScoped += 1;
    } else {
      // Anything that isn't Product-scoped (including "Quote" and any null/other scope value)
      // is grouped with the quote-scoped/validation step, per the sequencing rubric.
      quoteScoped += 1;
    }
  }

  return { productScoped, quoteScoped };
}

function extractCustomScripts(raw: Record<string, InspectorResult>): number {
  const result = raw["inspect_custom_scripts"];
  if (!result || !result.ok) {
    return 0;
  }

  const data = result.data as { customScripts?: unknown };
  return safeArrayLength(data.customScripts);
}

function buildCatalogStepText(counts: CatalogCounts): string {
  const parts: string[] = [];

  if (counts.products > 0) {
    parts.push(`${counts.products} product${counts.products === 1 ? "" : "s"}`);
  }
  if (counts.productOptions > 0) {
    parts.push(`${counts.productOptions} option${counts.productOptions === 1 ? "" : "s"}`);
  }
  if (counts.productFeatures > 0) {
    parts.push(`${counts.productFeatures} feature${counts.productFeatures === 1 ? "" : "s"}`);
  }
  if (counts.attributeSets > 0) {
    parts.push(`${counts.attributeSets} attribute set${counts.attributeSets === 1 ? "" : "s"}`);
  }
  if (counts.configurationAttributes > 0) {
    parts.push(
      `${counts.configurationAttributes} configuration attribute${counts.configurationAttributes === 1 ? "" : "s"}`
    );
  }

  if (parts.length === 0) {
    return (
      "**Catalog and bundle structure first.** Lowest risk, best existing tooling, and everything else " +
      "in the org (Price Rules, Discount Schedules, Product Rules) references real products — get the " +
      "product/bundle foundation right in Revenue Cloud before building pricing or configuration logic " +
      "on top of it. No catalog data available in this org; verify the product structure manually before " +
      "proceeding."
    );
  }

  const listText = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

  return (
    "**Catalog and bundle structure first.** Lowest risk, best existing tooling, and everything else " +
    `in the org (Price Rules, Discount Schedules, Product Rules) references real products — get the ` +
    `product/bundle foundation right in Revenue Cloud before building pricing or configuration logic ` +
    `on top of it. Migrate the ${listText} found in this org.`
  );
}

function buildDiscountSchedulesStepText(count: number): string {
  return (
    "**Discount Schedules next.** Near-direct structural mapping to " +
    "`PriceAdjustmentSchedule`/`PriceAdjustmentTier`; a good \"quick win\" that builds confidence in " +
    `the pricing procedure framework before tackling harder pricing logic. ${count} discount schedule${count === 1 ? "" : "s"} to migrate.`
  );
}

function buildTwinFieldsStepText(count: number): string {
  return (
    "**Twin Fields — audit before building anything else.** Because these are invisible to " +
    "relationship-based inspection, run the detection pass across the full org before finalizing any " +
    "Field Mapping design, so nothing gets silently dropped. This should happen early even though the " +
    "actual rework is small, because discovering a missed Twin Field late in the project means " +
    `re-opening already-"finished" Quote Line and Subscription configuration. ${count} twin field pair${count === 1 ? "" : "s"} detected.`
  );
}

function buildPriceRulesStepText(count: number): string {
  return (
    "**Price Rules (re-authored as Calculation Procedure steps).** Each existing Price Rule must be " +
    "re-expressed as a Calculation Procedure step in Revenue Cloud. This is where the bulk of pricing " +
    `logic lives — budget adequate time for re-authoring and validation. ${count} price rule${count === 1 ? "" : "s"} to re-author.`
  );
}

function buildProductScopedRulesStepText(count: number): string {
  return (
    "**Product-scoped Product/Configuration Rules.** These rules are tied to specific products and " +
    "must be re-implemented as product-level configuration logic in Revenue Cloud. They depend on the " +
    `catalog foundation being in place. ${count} product-scoped rule${count === 1 ? "" : "s"} to migrate.`
  );
}

function buildCustomScriptsStepText(count: number): string {
  return (
    "**Custom Scripts — highest complexity, longest lead time.** Custom Apex/JavaScript scripts are " +
    "the hardest category to migrate because they often encode business logic that has no direct " +
    "Revenue Cloud equivalent. Start these early, involve developers, and plan for extended " +
    `testing. ${count} custom script${count === 1 ? "" : "s"} to re-implement.`
  );
}

function buildQuoteScopedRulesStepText(count: number): string {
  return (
    "**Quote-scoped Product Rules / validation logic.** These rules operate at the quote level and " +
    "depend on Twin Field mappings and custom pricing being stable first. Sequence them after the " +
    `pricing and configuration layers are validated. ${count} quote-scoped rule${count === 1 ? "" : "s"} to migrate.`
  );
}

function buildUatStepText(): string {
  return (
    "**End-to-end UAT.** Run full quote-to-order and quote-to-subscription scenarios covering all " +
    "migrated pricing, configuration, and validation logic. This is the final gate before cutover — " +
    "do not skip or compress this phase."
  );
}

export function buildSequencingSection(raw: Record<string, InspectorResult>): string {
  const catalogCounts = extractCatalogCounts(raw);
  const discountScheduleCount = extractDiscountSchedules(raw);
  const twinFieldCount = extractTwinFieldPairs(raw);
  const priceRuleCount = extractPriceRules(raw);
  const { productScoped, quoteScoped } = extractProductRulesByScope(raw);
  const customScriptCount = extractCustomScripts(raw);

  const steps: Step[] = [];

  // Step 1: Catalog foundation — always present
  steps.push({ text: buildCatalogStepText(catalogCounts) });

  // Step 2: Discount Schedules — skip if zero
  if (discountScheduleCount > 0) {
    steps.push({ text: buildDiscountSchedulesStepText(discountScheduleCount) });
  }

  // Step 3: Twin Field mappings — skip if zero
  if (twinFieldCount > 0) {
    steps.push({ text: buildTwinFieldsStepText(twinFieldCount) });
  }

  // Step 4: Price Rules — skip if zero
  if (priceRuleCount > 0) {
    steps.push({ text: buildPriceRulesStepText(priceRuleCount) });
  }

  // Step 5: Product-scoped Product/Configuration Rules — skip if zero
  if (productScoped > 0) {
    steps.push({ text: buildProductScopedRulesStepText(productScoped) });
  }

  // Step 6: Custom Scripts — skip entirely if zero
  if (customScriptCount > 0) {
    steps.push({ text: buildCustomScriptsStepText(customScriptCount) });
  }

  // Step 7: Quote-scoped Product Rules / validation logic — skip if zero
  if (quoteScoped > 0) {
    steps.push({ text: buildQuoteScopedRulesStepText(quoteScoped) });
  }

  // Step 8: End-to-end UAT — always present
  steps.push({ text: buildUatStepText() });

  const lines: string[] = ["## Sequencing recommendation", ""];

  steps.forEach((step, i) => {
    lines.push(`${i + 1}. ${step.text}`);
  });

  return lines.join("\n");
}
