import type { AssessmentItem, Confidence, Disposition } from "./assessmentTypes";
import { RC_MAPPINGS } from "./rcMappings";
import type { InspectorResult } from "./buildInventorySection";
import { classifySellingModels } from "./buildSellingModelSection";

interface InspectPriceRulesData {
  priceRules: Array<{
    id: string;
    name: string;
    active: boolean;
    conditionsMet: string | null;
    evaluationEvent: string | null;
    targetObject: string | null;
    product: string | null;
    conditions: Array<{ id: string; ruleId: string | null; object: string | null; field: string | null; operator: string | null; filterType: string | null; value: string | null; index: number | null; }>;
    actions: Array<{ id: string; ruleId: string | null; targetObject: string | null; field: string | null; value: string | null; order: number | null; }>;
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
  products: Array<{ id: string }>;
  productOptions: unknown[];
  productFeatures: unknown[];
  attributeSets: Array<{ id: string; name: string }>;
  configurationAttributes: Array<{ id: string; name: string }>;
}

interface InspectQuoteUsageData {
  productUsage: Array<{ productId: string }>;
}

interface InspectAutomationScannerData {
  counts: {
    apexClassesCustom: number;
    apexTriggersCustom: number;
    validationRulesCustom: number;
  };
  customApexComponents: Array<{ referencesSbqq: boolean }>;
}

interface InspectCustomFieldsData {
  fields: Array<{ objectApiName: string; developerName: string }>;
}

interface InspectIntegrationsData {
  customNamedCredentials: unknown[];
  customRemoteSiteSettings: unknown[];
  connectedApplications: unknown[];
}

interface InspectReportingImpactData {
  counts: {
    reportsTotal: number;
    dashboardsTotal: number;
    reportsReferencingSbqq: number;
    dashboardsReferencingSbqq: number;
  };
}

interface DetectTwinFieldsData {
  twinFieldPairs: Array<{ sourceObject: string; destinationObject: string; fieldName: string; fieldType: string; fieldLabel: string }>;
}

interface InspectInstalledBaseData {
  counts: {
    contractsTotal: number;
    subscriptionsTotal: number;
    assetsTotal: number;
    renewalQuotesTotal: number;
    amendmentQuotesTotal: number;
  };
}

function getOkData<T>(raw: Record<string, InspectorResult>, key: string): T | null {
  const result = raw[key];
  if (!result || result.ok === false) return null;
  return result.data as T;
}

function buildEmptyItem(
  id: string,
  name: string,
  dimension: AssessmentItem["dimension"],
): AssessmentItem {
  return {
    id,
    name,
    dimension,
    businessIntent: `No ${name} configuration exists in this org.`,
    disposition: "RETIRE",
    suggestedTarget: "N/A — nothing to migrate",
    currentComplexity: "N/A",
    targetComplexity: "N/A",
    risk: "N/A",
    confidence: "High",
    evidenceClass: "Observed",
    recommendation: `No action needed; there is no ${name} configuration to carry forward.`,
    dependencies: [],
  };
}

function bumpComplexity(level: "Low" | "Medium" | "High"): "Low" | "Medium" | "High" {
  if (level === "Low") return "Medium";
  if (level === "Medium") return "High";
  return "High";
}

export function buildDispositions(raw: Record<string, InspectorResult>): AssessmentItem[] {
  const items: AssessmentItem[] = [];

  // Price Rules
  const priceRulesData = getOkData<InspectPriceRulesData>(raw, "inspect_price_rules");
  if (priceRulesData) {
    if (priceRulesData.priceRules.length === 0) {
      items.push(buildEmptyItem("price-rules", "Price Rules", "pricing"));
    } else {
      const total = priceRulesData.priceRules.reduce(
        (sum, rule) => sum + rule.conditions.length + rule.actions.length,
        0,
      );
      const average = total / priceRulesData.priceRules.length;
      const currentComplexity = average <= 2 ? "Low" : average <= 5 ? "Medium" : "High";
      const disposition = average <= 2 ? "TRANSFORM" : "REDESIGN";
      const targetComplexity =
        disposition === "TRANSFORM" ? currentComplexity : bumpComplexity(currentComplexity);
      items.push({
        id: "price-rules",
        name: "Price Rules",
        dimension: "pricing",
        businessIntent: "Applies conditional pricing adjustments to quote lines based on quote or product attributes.",
        disposition,
        suggestedTarget: RC_MAPPINGS.priceRules.targetObjects,
        currentComplexity,
        targetComplexity,
        risk: currentComplexity,
        confidence: "Medium",
        evidenceClass: "Observed",
        recommendation: RC_MAPPINGS.priceRules.mechanism,
        dependencies: [],
      });
    }
  }

  // Discount Schedules
  const discountData = getOkData<InspectDiscountSchedulesData>(raw, "inspect_discount_schedules");
  if (discountData) {
    if (discountData.discountSchedules.length === 0) {
      items.push(buildEmptyItem("discount-schedules", "Discount Schedules", "pricing"));
    } else {
      items.push({
        id: "discount-schedules",
        name: "Discount Schedules",
        dimension: "pricing",
        businessIntent: "Defines volume or tiered discount percentages applied to product pricing.",
        disposition: "TRANSFORM",
        suggestedTarget: RC_MAPPINGS.discountSchedules.targetObjects,
        currentComplexity: "Low",
        targetComplexity: "Low",
        risk: "Low",
        confidence: "Medium",
        evidenceClass: "Observed",
        recommendation: RC_MAPPINGS.discountSchedules.mechanism,
        dependencies: [],
      });
    }
  }

  // Product Rules
  const productRulesData = getOkData<InspectProductRulesData>(raw, "inspect_product_rules");
  if (productRulesData) {
    if (productRulesData.productRules.length === 0) {
      items.push(buildEmptyItem("product-rules", "Product Rules", "configurationRules"));
    } else {
      const productScoped = productRulesData.productRules.filter((r) => r.scope === "Product");
      const quoteScoped = productRulesData.productRules.filter((r) => r.scope !== "Product");

      if (productScoped.length > 0) {
        items.push({
          id: "product-rules-product-scope",
          name: "Product Rules (Product scope)",
          dimension: "configurationRules",
          businessIntent: "Validates or enforces product configuration constraints during quoting.",
          disposition: "TRANSFORM",
          suggestedTarget: RC_MAPPINGS.productRulesProductScoped.targetObjects,
          currentComplexity: "Low",
          targetComplexity: "Low",
          risk: "Low",
          confidence: "Medium",
          evidenceClass: "Observed",
          recommendation: RC_MAPPINGS.productRulesProductScoped.mechanism,
          dependencies: [],
        });
      }

      if (quoteScoped.length > 0) {
        const hasConfigRules = quoteScoped.some((r) => r.configurationRules.length > 0);
        const disposition = hasConfigRules ? "REDESIGN" : "INVESTIGATE";
        items.push({
          id: "product-rules-quote-scope",
          name: "Product Rules (Quote scope)",
          dimension: "configurationRules",
          businessIntent: "Validates quote-level conditions (for example minimum license counts) that span multiple lines.",
          disposition,
          suggestedTarget: RC_MAPPINGS.productRulesQuoteScoped.targetObjects,
          currentComplexity: "Medium",
          targetComplexity: disposition === "REDESIGN" ? "High" : "Medium",
          risk: "Medium-High",
          confidence: disposition === "REDESIGN" ? "Medium" : "Low",
          evidenceClass: disposition === "REDESIGN" ? "Observed" : "Inferred",
          recommendation: RC_MAPPINGS.productRulesQuoteScoped.mechanism,
          dependencies: [],
        });
      }
    }
  }

  // Custom Scripts
  const customScriptsData = getOkData<InspectCustomScriptsData>(raw, "inspect_custom_scripts");
  if (customScriptsData) {
    if (customScriptsData.customScripts.length === 0) {
      items.push(buildEmptyItem("custom-scripts", "Custom Scripts (Quote Calculator Plugin)", "customDevelopment"));
    } else {
      items.push({
        id: "custom-scripts",
        name: "Custom Scripts (Quote Calculator Plugin)",
        dimension: "customDevelopment",
        businessIntent: "Executes custom JavaScript pricing or quoting logic with no declarative equivalent.",
        disposition: "REDESIGN",
        suggestedTarget: RC_MAPPINGS.customScripts.targetObjects,
        currentComplexity: "High",
        targetComplexity: "High",
        risk: "High",
        confidence: "High",
        evidenceClass: "Observed",
        recommendation: RC_MAPPINGS.customScripts.mechanism,
        dependencies: [],
      });
    }
  }

  // Catalog Structure
  const catalogData = getOkData<InspectCatalogStructureData>(raw, "inspect_catalog_structure");
  if (catalogData) {
    if (catalogData.products.length === 0) {
      items.push(buildEmptyItem("catalog-structure", "Catalog Structure", "catalogSellingModels"));
    } else {
      const hasAttributes =
        catalogData.configurationAttributes.length > 0 || catalogData.attributeSets.length > 0;
      // Risk is driven by option volume, independent of the attribute/complexity branch above.
      const risk = catalogData.productOptions.length > 200 ? "Medium" : "Low";
      items.push({
        id: "catalog-structure",
        name: "Catalog Structure",
        dimension: "catalogSellingModels",
        businessIntent: "Defines the product catalog, bundle structure, and configuration options available for quoting.",
        disposition: hasAttributes ? "REDESIGN" : "TRANSFORM",
        suggestedTarget: RC_MAPPINGS.catalogStructure.targetObjects,
        currentComplexity: hasAttributes ? "Medium" : "Low",
        targetComplexity: hasAttributes ? "High" : "Low",
        risk,
        confidence: "Medium",
        evidenceClass: "Observed",
        recommendation: RC_MAPPINGS.catalogStructure.mechanism,
        dependencies: [],
      });
    }
  }

  // Twin Fields
  const twinFieldsData = getOkData<DetectTwinFieldsData>(raw, "detect_twin_fields");
  if (twinFieldsData) {
    if (twinFieldsData.twinFieldPairs.length === 0) {
      items.push(buildEmptyItem("twin-fields", "Twin Fields", "dataMigrationQuality"));
    } else {
      items.push({
        id: "twin-fields",
        name: "Twin Fields",
        dimension: "dataMigrationQuality",
        businessIntent: "Copies a field's value from a source object to a newly-created Quote Line purely by matching field API name and type, with no explicit configuration record.",
        disposition: "TRANSFORM",
        suggestedTarget: RC_MAPPINGS.twinFields.targetObjects,
        currentComplexity: "Low",
        targetComplexity: "Low",
        risk: "Medium-High",
        confidence: "Medium",
        evidenceClass: "Inferred",
        recommendation: RC_MAPPINGS.twinFields.mechanism,
        dependencies: [],
      });
    }
  }

  // Installed Base (Contracts, Subscriptions, Assets, Renewals, Amendments)
  const installedBaseData = getOkData<InspectInstalledBaseData>(raw, "inspect_installed_base");
  if (installedBaseData) {
    const { contractsTotal, subscriptionsTotal, renewalQuotesTotal, amendmentQuotesTotal } = installedBaseData.counts;
    if (contractsTotal === 0 && subscriptionsTotal === 0) {
      items.push(buildEmptyItem("installed-base", "Installed Base (Contracts, Subscriptions, Renewals, Amendments)", "installedBaseLifecycle"));
    } else {
      // Record counts alone cannot determine the org's intended renewal, amendment, cancellation,
      // or cutover model -- that requires declared business-process confirmation, not just data.
      // So this always lands on INVESTIGATE rather than DIRECT/TRANSFORM, regardless of volume.
      const hasActiveLifecycleActivity = renewalQuotesTotal > 0 || amendmentQuotesTotal > 0;
      const currentComplexity = subscriptionsTotal > 50 ? "High" : subscriptionsTotal > 10 ? "Medium" : "Low";
      items.push({
        id: "installed-base",
        name: "Installed Base (Contracts, Subscriptions, Renewals, Amendments)",
        dimension: "installedBaseLifecycle",
        businessIntent: "Represents the org's live installed base -- active subscriptions, contracts, renewals, and amendments already in production that must be converted or coexist during migration.",
        disposition: "INVESTIGATE",
        suggestedTarget: "Asset-based subscription management in Revenue Cloud (exact target object mapping not yet verified against a live Revenue Cloud org)",
        currentComplexity,
        targetComplexity: currentComplexity === "Low" ? "Medium" : "High",
        risk: hasActiveLifecycleActivity ? "High" : "Medium-High",
        confidence: "Low",
        evidenceClass: "Observed",
        recommendation: "Confirm the renewal, amendment, cancellation, and cutover strategy with the business process owner before finalizing a conversion approach; this is a historical data conversion, not a configuration migration.",
        dependencies: [],
      });
    }
  }

  // Product Selling Model Readiness
  const sellingModel = classifySellingModels(raw);
  if (sellingModel && sellingModel.counts.productsClassified > 0) {
    const { counts } = sellingModel;
    const unknownRatio = counts.unknown / counts.productsClassified;
    const hasConflicts = counts.mixed > 0;

    let disposition: Disposition;
    let confidence: Confidence;
    if (unknownRatio > 0.5) {
      disposition = "INVESTIGATE";
      confidence = "Low";
    } else if (hasConflicts) {
      disposition = "INVESTIGATE";
      confidence = "Medium";
    } else {
      disposition = "TRANSFORM";
      confidence = "Medium";
    }

    const recommendation =
      unknownRatio > 0.5
        ? "Most products have no catalog-level selling-model signal and limited transactional history; populate SBQQ__ChargeType__c (or equivalent) on the catalog, or gather more transaction history, before finalizing Product Selling Model design."
        : hasConflicts
          ? "Resolve products with conflicting selling-model evidence (sold both recurring and one-time) with the business owner before assigning a single Product Selling Model per product."
          : "Selling-model evidence is reasonably clean; proceed to design Product Selling Model assignments per product once the target Revenue Cloud release is confirmed.";

    items.push({
      id: "selling-model-readiness",
      name: "Product Selling Model Readiness",
      dimension: "catalogSellingModels",
      businessIntent: "Classifies how each product is actually sold -- one-time, term subscription, evergreen, or usage/consumption -- a foundational input to Revenue Cloud's Product Selling Model design.",
      disposition,
      suggestedTarget: "Revenue Cloud Product Selling Model (One Time / Subscription / Usage) -- exact target configuration not yet verified against a live Revenue Cloud org",
      currentComplexity: hasConflicts ? "High" : unknownRatio > 0.5 ? "Medium" : "Low",
      targetComplexity: hasConflicts ? "High" : "Medium",
      risk: hasConflicts ? "High" : unknownRatio > 0.5 ? "Medium-High" : "Medium",
      confidence,
      evidenceClass: unknownRatio > 0.5 ? "Inferred" : "Observed",
      recommendation,
      dependencies: [],
    });
  }

  // Quote Usage / Catalog Rationalization
  const quoteUsageData = getOkData<InspectQuoteUsageData>(raw, "inspect_quote_usage");
  const catalogForUsage = getOkData<InspectCatalogStructureData>(raw, "inspect_catalog_structure");
  if (quoteUsageData && catalogForUsage && catalogForUsage.products.length > 0) {
    const quotedIds = new Set(quoteUsageData.productUsage.map((p) => p.productId));
    const neverQuotedCount = catalogForUsage.products.filter((p) => !quotedIds.has(p.id)).length;
    const neverQuotedRatio = neverQuotedCount / catalogForUsage.products.length;
    const significantRationalizationOpportunity = neverQuotedRatio > 0.4;

    items.push({
      id: "quote-usage-rationalization",
      name: "Quote Usage / Catalog Rationalization",
      dimension: "catalogSellingModels",
      businessIntent: "Identifies catalog products with no observed quoting activity, as candidates for rationalization rather than blind migration.",
      disposition: significantRationalizationOpportunity ? "INVESTIGATE" : "TRANSFORM",
      suggestedTarget: "N/A -- this is a rationalization signal, not an object migrated to Revenue Cloud",
      currentComplexity: "Low",
      targetComplexity: "Low",
      risk: significantRationalizationOpportunity ? "Medium" : "Low",
      confidence: "Medium",
      evidenceClass: "Observed",
      recommendation: significantRationalizationOpportunity
        ? `${neverQuotedCount} of ${catalogForUsage.products.length} catalog products (${Math.round(neverQuotedRatio * 100)}%) have never been quoted in the available sample; review these with the business before migrating them as-is.`
        : "Most of the catalog has observed quoting activity; no significant rationalization opportunity identified from usage data alone.",
      dependencies: [],
    });
  }

  // Custom Automation Scan (Apex, Triggers, Validation Rules)
  const automationData = getOkData<InspectAutomationScannerData>(raw, "inspect_automation_scanner");
  if (automationData) {
    const hasSbqqReferences = automationData.customApexComponents.some((c) => c.referencesSbqq);
    const hasAnyCustomAutomation =
      automationData.counts.apexClassesCustom > 0 ||
      automationData.counts.apexTriggersCustom > 0 ||
      automationData.counts.validationRulesCustom > 0;

    if (hasSbqqReferences) {
      items.push({
        id: "automation-scan",
        name: "Custom Automation (Apex, Triggers, Validation Rules)",
        dimension: "customDevelopment",
        businessIntent: "Customer-authored Apex or triggers that read or write CPQ (SBQQ) objects directly.",
        disposition: "REDESIGN",
        suggestedTarget: "Revenue Cloud equivalent Apex/Flow automation on the new data model -- exact target objects depend on the specific logic and are not derivable from a substring match alone",
        currentComplexity: "High",
        targetComplexity: "High",
        risk: "High",
        confidence: "Medium",
        evidenceClass: "Observed",
        recommendation: "Review each flagged component's actual logic with the developer who owns it; a substring match confirms SBQQ objects are referenced but not how, so re-implementation effort cannot be estimated from this scan alone.",
        dependencies: [],
      });
    } else if (!hasAnyCustomAutomation) {
      items.push(buildEmptyItem("automation-scan", "Custom Automation (Apex, Triggers, Validation Rules)", "customDevelopment"));
    }
    // Custom automation exists but none of it references CPQ objects: not a migration concern for
    // this assessment, so no item is pushed for that case.
  }

  // Custom Field Inventory
  const customFieldsData = getOkData<InspectCustomFieldsData>(raw, "inspect_custom_fields");
  if (customFieldsData) {
    if (customFieldsData.fields.length === 0) {
      items.push(buildEmptyItem("custom-field-inventory", "Custom Fields (Product2, Quote, Subscription, Contract, and related objects)", "dataMigrationQuality"));
    } else {
      items.push({
        id: "custom-field-inventory",
        name: "Custom Fields (Product2, Quote, Subscription, Contract, and related objects)",
        dimension: "dataMigrationQuality",
        businessIntent: "Customer-created fields on core CPQ-adjacent objects that may carry pricing, integration, reporting, or automation dependencies not yet classified.",
        disposition: "INVESTIGATE",
        suggestedTarget: "N/A -- each field's target mapping depends on its individual purpose, which this inventory does not yet classify",
        currentComplexity: "Medium",
        targetComplexity: "Medium",
        risk: "Medium",
        confidence: "Low",
        evidenceClass: "Observed",
        recommendation: `${customFieldsData.fields.length} custom field(s) were found across the scanned objects; review each with the field's owner to classify its purpose (pricing, integration, reporting, automation, or display-only) before deciding its migration treatment.`,
        dependencies: [],
      });
    }
  }

  // Integration Impact (Named Credentials, Remote Site Settings, Connected Apps)
  const integrationsData = getOkData<InspectIntegrationsData>(raw, "inspect_integrations");
  if (integrationsData) {
    const hasAnyIntegrationEvidence =
      integrationsData.customNamedCredentials.length > 0 ||
      integrationsData.customRemoteSiteSettings.length > 0 ||
      integrationsData.connectedApplications.length > 0;

    if (hasAnyIntegrationEvidence) {
      items.push({
        id: "integration-impact",
        name: "Integration Impact (Named Credentials, Remote Site Settings, Connected Apps)",
        dimension: "integrations",
        businessIntent: "External systems or connected apps that integrate with this org and may depend on CPQ data or automation.",
        disposition: "INVESTIGATE",
        suggestedTarget: "N/A -- depends on what each integration actually does, which metadata alone cannot reveal",
        currentComplexity: "Medium",
        targetComplexity: "Medium",
        risk: "Medium-High",
        confidence: "Low",
        evidenceClass: "Observed",
        recommendation: "Confirm the full integration landscape with the business/IT owner; metadata visibility alone cannot reveal inbound integrations or middleware-owned field mappings that never appear in Salesforce configuration.",
        dependencies: [],
      });
    } else {
      items.push(buildEmptyItem("integration-impact", "Integration Impact (Named Credentials, Remote Site Settings, Connected Apps)", "integrations"));
    }
  }

  // Reporting Impact (Reports, Dashboards referencing CPQ)
  const reportingImpactData = getOkData<InspectReportingImpactData>(raw, "inspect_reporting_impact");
  if (reportingImpactData) {
    const { reportsTotal, dashboardsTotal, reportsReferencingSbqq, dashboardsReferencingSbqq } = reportingImpactData.counts;
    if (reportsReferencingSbqq > 0 || dashboardsReferencingSbqq > 0) {
      items.push({
        id: "reporting-impact",
        name: "Reporting Impact (Reports, Dashboards)",
        dimension: "reportingSecurityOps",
        businessIntent: "Reports and dashboards whose definitions reference SBQQ (CPQ) objects and will need rebuilding or validation after migration.",
        disposition: "INVESTIGATE",
        suggestedTarget: "N/A -- each report/dashboard needs individual rebuild against the new Revenue Cloud data model",
        currentComplexity: "Medium",
        targetComplexity: "Medium",
        risk: "Medium",
        confidence: "Medium",
        evidenceClass: "Observed",
        recommendation: `${reportsReferencingSbqq + dashboardsReferencingSbqq} report(s)/dashboard(s) reference SBQQ objects and will need rebuilding once the underlying data model changes; validate each with its business owner.`,
        dependencies: [],
      });
    } else if (reportsTotal === 0 && dashboardsTotal === 0) {
      items.push(buildEmptyItem("reporting-impact", "Reporting Impact (Reports, Dashboards)", "reportingSecurityOps"));
    }
    // Reports/dashboards exist but none reference SBQQ: not a migration concern for this
    // assessment, so no item is pushed for that case.
  }

  return items;
}
