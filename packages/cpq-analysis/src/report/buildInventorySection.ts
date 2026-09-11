import { RC_MAPPINGS } from "./rcMappings";

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
  discountSchedules: Array<{
    id: string;
    name: string;
    type: string | null;
    discountUnit: string | null;
    product: string | null;
    description: string | null;
    tiers: Array<{
      id: string;
      scheduleId: string | null;
      name: string;
      number: number | null;
      lowerBound: number | null;
      upperBound: number | null;
      discount: number | null;
      discountAmount: number | null;
      price: number | null;
    }>;
  }>;
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
    configurationRules: Array<{
      id: string;
      productRuleId: string | null;
      active: boolean;
      product: string | null;
      productFeature: string | null;
    }>;
  }>;
}

interface InspectCustomScriptsData {
  customScripts: Array<{
    id: string;
    name: string;
    codeLength: number;
    codePreview: string;
  }>;
}

interface InspectCatalogStructureData {
  products: Array<{
    id: string;
    name: string;
    productCode: string | null;
    family: string | null;
    isActive: boolean;
  }>;
  productOptions: Array<{
    id: string;
    name: string;
    configuredSku: string | null;
    optionalSku: string | null;
    feature: string | null;
    type: string | null;
    required: boolean;
    minQuantity: number | null;
    maxQuantity: number | null;
  }>;
  productFeatures: Array<{
    id: string;
    name: string;
    configuredSku: string | null;
    minOptionCount: number | null;
    maxOptionCount: number | null;
    optionSelectionMethod: string | null;
  }>;
  attributeSets: Array<{
    id: string;
    name: string;
  }>;
  configurationAttributes: Array<{
    id: string;
    name: string;
    product: string | null;
    feature: string | null;
    required: boolean;
    hidden: boolean;
    defaultField: string | null;
  }>;
}

interface DetectTwinFieldsData {
  twinFieldPairs: Array<{
    sourceObject: string;
    destinationObject: string;
    fieldName: string;
    fieldType: string;
    fieldLabel: string;
  }>;
}

function md(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return value;
}

function plural(count: number, singular: string, pluralForm?: string): string {
  const form = count === 1 ? singular : pluralForm ?? `${singular}s`;
  return `${count} ${form}`;
}

function getOkData<T>(raw: Record<string, InspectorResult>, key: string): T | null {
  const result = raw[key];
  if (result && result.ok) {
    return result.data as T;
  }
  return null;
}

function failureNote(raw: Record<string, InspectorResult>, key: string): string {
  const result = raw[key];
  if (result && !result.ok) {
    return `_Inspector failed: ${result.error.message}_`;
  }
  return "_No data returned for this inspector._";
}

function buildPriceRulesSection(raw: Record<string, InspectorResult>): string {
  const lines: string[] = [];
  lines.push("### Price Rules");
  lines.push("");

  const data = getOkData<InspectPriceRulesData>(raw, "inspect_price_rules");
  if (!data) {
    lines.push(failureNote(raw, "inspect_price_rules"));
    lines.push("");
  } else {
    const rules = data.priceRules;
    const totalConditions = rules.reduce((sum, r) => sum + r.conditions.length, 0);
    const totalActions = rules.reduce((sum, r) => sum + r.actions.length, 0);

    lines.push(
      `${plural(rules.length, "rule")} across ${plural(totalConditions, "condition")} and ${plural(totalActions, "action")}.`
    );
    lines.push("");

    for (const rule of rules) {
      const active = rule.active ? "active" : "inactive";
      const event = md(rule.evaluationEvent);
      const target = md(rule.targetObject);
      const product = md(rule.product);
      lines.push(
        `- **${rule.name}** (${rule.id}) — ${active}; evaluation event: ${event}; target object: ${target}; product: ${product}; ${plural(rule.conditions.length, "condition")}, ${plural(rule.actions.length, "action")}.`
      );
    }
    lines.push("");
  }

  lines.push(`**Revenue Cloud target:** ${RC_MAPPINGS.priceRules.targetObjects}`);
  lines.push("");
  lines.push(`**Migration mechanism:** ${RC_MAPPINGS.priceRules.mechanism}`);
  lines.push("");
  return lines.join("\n");
}

function buildDiscountSchedulesSection(raw: Record<string, InspectorResult>): string {
  const lines: string[] = [];
  lines.push("### Discount Schedules");
  lines.push("");

  const data = getOkData<InspectDiscountSchedulesData>(raw, "inspect_discount_schedules");
  if (!data) {
    lines.push(failureNote(raw, "inspect_discount_schedules"));
    lines.push("");
  } else {
    const schedules = data.discountSchedules;
    const totalTiers = schedules.reduce((sum, s) => sum + s.tiers.length, 0);

    lines.push(
      `${plural(schedules.length, "schedule")} with ${plural(totalTiers, "tier")} in total.`
    );
    lines.push("");

    for (const schedule of schedules) {
      const type = md(schedule.type);
      const unit = md(schedule.discountUnit);
      const product = md(schedule.product);
      lines.push(
        `- **${schedule.name}** (${schedule.id}) — type: ${type}; discount unit: ${unit}; product: ${product}; ${plural(schedule.tiers.length, "tier")}.`
      );
    }
    lines.push("");
  }

  lines.push(`**Revenue Cloud target:** ${RC_MAPPINGS.discountSchedules.targetObjects}`);
  lines.push("");
  lines.push(`**Migration mechanism:** ${RC_MAPPINGS.discountSchedules.mechanism}`);
  lines.push("");
  return lines.join("\n");
}

function buildProductRulesSection(raw: Record<string, InspectorResult>): string {
  const lines: string[] = [];
  lines.push("### Product Rules");
  lines.push("");

  const data = getOkData<InspectProductRulesData>(raw, "inspect_product_rules");
  if (!data) {
    lines.push(failureNote(raw, "inspect_product_rules"));
    lines.push("");
  } else {
    const productScoped = data.productRules.filter((r) => r.scope === "Product");
    const quoteScoped = data.productRules.filter((r) => r.scope !== "Product");

    lines.push(
      `${plural(data.productRules.length, "rule")} total: ${plural(productScoped.length, "product-scoped rule")} and ${plural(quoteScoped.length, "quote-scoped/other rule")}.`
    );
    lines.push("");

    lines.push("#### Product-scoped");
    lines.push("");
    if (productScoped.length === 0) {
      lines.push("_None found._");
      lines.push("");
    } else {
      for (const rule of productScoped) {
        const active = rule.active ? "active" : "inactive";
        const type = md(rule.type);
        const event = md(rule.evaluationEvent);
        lines.push(
          `- **${rule.name}** (${rule.id}) — ${active}; type: ${type}; evaluation event: ${event}; ${plural(rule.configurationRules.length, "configuration rule")}.`
        );
      }
      lines.push("");
    }

    lines.push("#### Quote-scoped / other");
    lines.push("");
    if (quoteScoped.length === 0) {
      lines.push("_None found._");
      lines.push("");
    } else {
      for (const rule of quoteScoped) {
        const active = rule.active ? "active" : "inactive";
        const type = md(rule.type);
        const event = md(rule.evaluationEvent);
        const scope = md(rule.scope);
        lines.push(
          `- **${rule.name}** (${rule.id}) — ${active}; scope: ${scope}; type: ${type}; evaluation event: ${event}; ${plural(rule.configurationRules.length, "configuration rule")}.`
        );
      }
      lines.push("");
    }
  }

  lines.push(`**Revenue Cloud target (product-scoped):** ${RC_MAPPINGS.productRulesProductScoped.targetObjects}`);
  lines.push("");
  lines.push(`**Migration mechanism (product-scoped):** ${RC_MAPPINGS.productRulesProductScoped.mechanism}`);
  lines.push("");
  lines.push(`**Revenue Cloud target (quote-scoped):** ${RC_MAPPINGS.productRulesQuoteScoped.targetObjects}`);
  lines.push("");
  lines.push(`**Migration mechanism (quote-scoped):** ${RC_MAPPINGS.productRulesQuoteScoped.mechanism}`);
  lines.push("");
  return lines.join("\n");
}

/**
 * Picks a fence longer than any run of backticks already present in the code, so a script that
 * happens to contain e.g. a template literal with embedded backticks can never prematurely close
 * the fence (or leave it unclosed) and corrupt every section rendered after this one -- a real bug
 * found in practice, since raw script source is untrusted, arbitrary text as far as Markdown is
 * concerned.
 */
function safeCodeFence(code: string): string {
  const runs = code.match(/`+/g) ?? [];
  const longestRun = runs.reduce((max, run) => Math.max(max, run.length), 0);
  return "`".repeat(Math.max(3, longestRun + 1));
}

function buildCustomScriptsSection(raw: Record<string, InspectorResult>): string {
  const lines: string[] = [];
  lines.push("### Custom Scripts");
  lines.push("");

  const data = getOkData<InspectCustomScriptsData>(raw, "inspect_custom_scripts");
  if (!data) {
    lines.push(failureNote(raw, "inspect_custom_scripts"));
    lines.push("");
  } else {
    const scripts = data.customScripts;
    lines.push(`${plural(scripts.length, "script")} found.`);
    lines.push("");

    for (const script of scripts) {
      lines.push(`#### ${script.name} (${script.id})`);
      lines.push("");
      lines.push(`${script.codeLength} characters. **Manual review required:** this script's pricing logic has no automated migration path and must be assessed by a developer for its Revenue Cloud replacement.`);
      lines.push("");
      const fence = safeCodeFence(script.codePreview);
      lines.push(`${fence}javascript`);
      lines.push(script.codePreview);
      lines.push(fence);
      lines.push("");
    }
  }

  lines.push(`**Revenue Cloud target:** ${RC_MAPPINGS.customScripts.targetObjects}`);
  lines.push("");
  lines.push(`**Migration mechanism:** ${RC_MAPPINGS.customScripts.mechanism}`);
  lines.push("");
  return lines.join("\n");
}

function buildCatalogStructureSection(raw: Record<string, InspectorResult>): string {
  const lines: string[] = [];
  lines.push("### Catalog Structure");
  lines.push("");

  const data = getOkData<InspectCatalogStructureData>(raw, "inspect_catalog_structure");
  if (!data) {
    lines.push(failureNote(raw, "inspect_catalog_structure"));
    lines.push("");
  } else {
    lines.push(
      `${plural(data.products.length, "product")}, ${plural(data.productOptions.length, "product option")}, ${plural(data.productFeatures.length, "product feature")}, ${plural(data.attributeSets.length, "attribute set")}, ${plural(data.configurationAttributes.length, "configuration attribute")}.`
    );
    lines.push("");

    if (data.products.length > 0) {
      lines.push("Sample products (first 5):");
      lines.push("");
      const sample = data.products.slice(0, 5);
      for (const product of sample) {
        const code = md(product.productCode);
        const family = md(product.family);
        const active = product.isActive ? "active" : "inactive";
        lines.push(
          `- **${product.name}** (${product.id}) — code: ${code}; family: ${family}; ${active}.`
        );
      }
      lines.push("");
    }
  }

  lines.push(`**Revenue Cloud target:** ${RC_MAPPINGS.catalogStructure.targetObjects}`);
  lines.push("");
  lines.push(`**Migration mechanism:** ${RC_MAPPINGS.catalogStructure.mechanism}`);
  lines.push("");
  return lines.join("\n");
}

function buildTwinFieldsSection(raw: Record<string, InspectorResult>): string {
  const lines: string[] = [];
  lines.push("### Twin Fields");
  lines.push("");

  const data = getOkData<DetectTwinFieldsData>(raw, "detect_twin_fields");
  if (!data) {
    lines.push(failureNote(raw, "detect_twin_fields"));
    lines.push("");
  } else {
    const pairs = data.twinFieldPairs;
    lines.push(`${plural(pairs.length, "twin field pair")} found.`);
    lines.push("");

    for (const pair of pairs) {
      lines.push(
        `- \`${pair.fieldName}\`: \`${pair.sourceObject}\` <-> \`${pair.destinationObject}\` (${pair.fieldType})`
      );
    }
    lines.push("");
  }

  lines.push(`**Revenue Cloud target:** ${RC_MAPPINGS.twinFields.targetObjects}`);
  lines.push("");
  lines.push(`**Migration mechanism:** ${RC_MAPPINGS.twinFields.mechanism}`);
  lines.push("");
  return lines.join("\n");
}

function buildSummaryTable(raw: Record<string, InspectorResult>): string {
  const lines: string[] = [];
  lines.push("| CPQ source | Records found | Revenue Cloud target | Migration mechanism |");
  lines.push("|---|---:|---|---|");

  const priceRules = getOkData<InspectPriceRulesData>(raw, "inspect_price_rules");
  if (priceRules) {
    const rules = priceRules.priceRules;
    const conditions = rules.reduce((sum, r) => sum + r.conditions.length, 0);
    const actions = rules.reduce((sum, r) => sum + r.actions.length, 0);
    lines.push(
      `| \`SBQQ__PriceRule__c\` + \`SBQQ__PriceCondition__c\` + \`SBQQ__PriceAction__c\` | ${plural(rules.length, "rule")}, ${plural(conditions, "condition")}, ${plural(actions, "action")} | ${RC_MAPPINGS.priceRules.targetObjects} | ${RC_MAPPINGS.priceRules.mechanism} |`
    );
  } else {
    lines.push(
      `| \`SBQQ__PriceRule__c\` + \`SBQQ__PriceCondition__c\` + \`SBQQ__PriceAction__c\` | — | ${RC_MAPPINGS.priceRules.targetObjects} | ${RC_MAPPINGS.priceRules.mechanism} |`
    );
  }

  const discountSchedules = getOkData<InspectDiscountSchedulesData>(raw, "inspect_discount_schedules");
  if (discountSchedules) {
    const schedules = discountSchedules.discountSchedules;
    const tiers = schedules.reduce((sum, s) => sum + s.tiers.length, 0);
    lines.push(
      `| \`SBQQ__DiscountSchedule__c\` + \`SBQQ__DiscountTier__c\` | ${plural(schedules.length, "schedule")}, ${plural(tiers, "tier")} | ${RC_MAPPINGS.discountSchedules.targetObjects} | ${RC_MAPPINGS.discountSchedules.mechanism} |`
    );
  } else {
    lines.push(
      `| \`SBQQ__DiscountSchedule__c\` + \`SBQQ__DiscountTier__c\` | — | ${RC_MAPPINGS.discountSchedules.targetObjects} | ${RC_MAPPINGS.discountSchedules.mechanism} |`
    );
  }

  const productRules = getOkData<InspectProductRulesData>(raw, "inspect_product_rules");
  if (productRules) {
    const rules = productRules.productRules;
    const productScoped = rules.filter((r) => r.scope === "Product").length;
    const quoteScoped = rules.length - productScoped;
    lines.push(
      `| \`SBQQ__ProductRule__c\` + \`SBQQ__ConfigurationRule__c\` | ${plural(rules.length, "rule")} (${productScoped} product-scoped, ${quoteScoped} quote-scoped/other) | ${RC_MAPPINGS.productRulesProductScoped.targetObjects} / ${RC_MAPPINGS.productRulesQuoteScoped.targetObjects} | ${RC_MAPPINGS.productRulesProductScoped.mechanism} / ${RC_MAPPINGS.productRulesQuoteScoped.mechanism} |`
    );
  } else {
    lines.push(
      `| \`SBQQ__ProductRule__c\` + \`SBQQ__ConfigurationRule__c\` | — | ${RC_MAPPINGS.productRulesProductScoped.targetObjects} / ${RC_MAPPINGS.productRulesQuoteScoped.targetObjects} | ${RC_MAPPINGS.productRulesProductScoped.mechanism} / ${RC_MAPPINGS.productRulesQuoteScoped.mechanism} |`
    );
  }

  const customScripts = getOkData<InspectCustomScriptsData>(raw, "inspect_custom_scripts");
  if (customScripts) {
    lines.push(
      `| \`SBQQ__CustomScript__c\` | ${plural(customScripts.customScripts.length, "script")} | ${RC_MAPPINGS.customScripts.targetObjects} | ${RC_MAPPINGS.customScripts.mechanism} |`
    );
  } else {
    lines.push(
      `| \`SBQQ__CustomScript__c\` | — | ${RC_MAPPINGS.customScripts.targetObjects} | ${RC_MAPPINGS.customScripts.mechanism} |`
    );
  }

  const catalog = getOkData<InspectCatalogStructureData>(raw, "inspect_catalog_structure");
  if (catalog) {
    lines.push(
      `| \`Product2\` + \`SBQQ__ProductOption__c\` + \`SBQQ__ProductFeature__c\` + \`SBQQ__AttributeSet__c\` + \`SBQQ__ConfigurationAttribute__c\` | ${plural(catalog.products.length, "product")}, ${plural(catalog.productOptions.length, "option")}, ${plural(catalog.productFeatures.length, "feature")}, ${plural(catalog.attributeSets.length, "attribute set")}, ${plural(catalog.configurationAttributes.length, "config attribute")} | ${RC_MAPPINGS.catalogStructure.targetObjects} | ${RC_MAPPINGS.catalogStructure.mechanism} |`
    );
  } else {
    lines.push(
      `| \`Product2\` + \`SBQQ__ProductOption__c\` + \`SBQQ__ProductFeature__c\` + \`SBQQ__AttributeSet__c\` + \`SBQQ__ConfigurationAttribute__c\` | — | ${RC_MAPPINGS.catalogStructure.targetObjects} | ${RC_MAPPINGS.catalogStructure.mechanism} |`
    );
  }

  const twinFields = getOkData<DetectTwinFieldsData>(raw, "detect_twin_fields");
  if (twinFields) {
    lines.push(
      `| Twin field pairs (cross-object) | ${plural(twinFields.twinFieldPairs.length, "pair")} | ${RC_MAPPINGS.twinFields.targetObjects} | ${RC_MAPPINGS.twinFields.mechanism} |`
    );
  } else {
    lines.push(
      `| Twin field pairs (cross-object) | — | ${RC_MAPPINGS.twinFields.targetObjects} | ${RC_MAPPINGS.twinFields.mechanism} |`
    );
  }

  return lines.join("\n");
}

export function buildInventorySection(raw: Record<string, InspectorResult>): string {
  const parts: string[] = [];
  parts.push("## Object-by-object inventory");
  parts.push("");
  parts.push(buildSummaryTable(raw));
  parts.push("");
  parts.push(buildPriceRulesSection(raw));
  parts.push(buildDiscountSchedulesSection(raw));
  parts.push(buildProductRulesSection(raw));
  parts.push(buildCustomScriptsSection(raw));
  parts.push(buildCatalogStructureSection(raw));
  parts.push(buildTwinFieldsSection(raw));
  return parts.join("\n");
}
