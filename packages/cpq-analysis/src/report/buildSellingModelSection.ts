import type { InspectorResult } from "./buildInventorySection";

interface ProductSellingModelFields {
  id: string;
  name: string;
  chargeType: string | null;
  productSubscriptionType: string | null;
  subscriptionTerm: number | null;
  hasConsumptionSchedule: boolean;
}

interface ProductSubscriptionTypeCount {
  productId: string;
  subscriptionType: string | null;
  count: number;
}

interface InspectSellingModelData {
  productsTotalActive: number;
  products: ProductSellingModelFields[];
  subscriptionTypesByProduct: ProductSubscriptionTypeCount[];
}

export type SellingModelClassification =
  | "One-Time"
  | "Term Subscription"
  | "Evergreen"
  | "Usage/Consumption"
  | "Mixed"
  | "Unknown";

export interface ProductSellingModelClassification {
  productId: string;
  productName: string;
  classification: SellingModelClassification;
  confidence: "High" | "Medium" | "Low";
  evidenceClass: "Observed" | "Inferred";
  rationale: string;
}

export interface SellingModelCounts {
  productsTotalActive: number;
  productsClassified: number;
  oneTime: number;
  termSubscription: number;
  evergreen: number;
  usageConsumption: number;
  mixed: number;
  unknown: number;
}

function md(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function plural(count: number, singular: string, pluralForm?: string): string {
  const form = count === 1 ? singular : pluralForm ?? `${singular}s`;
  return `${count} ${form}`;
}

function getOkData<T>(raw: Record<string, InspectorResult>, key: string): T | null {
  const result = raw[key];
  if (result && result.ok) return result.data as T;
  return null;
}

function failureNote(raw: Record<string, InspectorResult>, key: string): string {
  const result = raw[key];
  if (result && !result.ok) return `_Inspector failed: ${result.error.message}_`;
  return "_No data returned for this inspector._";
}

export function classifySellingModels(
  raw: Record<string, InspectorResult>
): { counts: SellingModelCounts; products: ProductSellingModelClassification[] } | null {
  const data = getOkData<InspectSellingModelData>(raw, "inspect_selling_model");
  if (data === null) return null;

  const observedByProduct = new Map<string, Set<string>>();
  for (const row of data.subscriptionTypesByProduct) {
    if (row.subscriptionType === null) continue;
    let set = observedByProduct.get(row.productId);
    if (set === undefined) {
      set = new Set<string>();
      observedByProduct.set(row.productId, set);
    }
    set.add(row.subscriptionType);
  }

  const products: ProductSellingModelClassification[] = [];
  const counts: SellingModelCounts = {
    productsTotalActive: data.productsTotalActive,
    productsClassified: data.products.length,
    oneTime: 0,
    termSubscription: 0,
    evergreen: 0,
    usageConsumption: 0,
    mixed: 0,
    unknown: 0,
  };

  for (const product of data.products) {
    const observedSet = observedByProduct.get(product.id);
    const observedSubscriptionTypes = observedSet ? Array.from(observedSet) : [];
    const classification = classifyOne(product, observedSubscriptionTypes);
    products.push(classification);
    switch (classification.classification) {
      case "One-Time":
        counts.oneTime += 1;
        break;
      case "Term Subscription":
        counts.termSubscription += 1;
        break;
      case "Evergreen":
        counts.evergreen += 1;
        break;
      case "Usage/Consumption":
        counts.usageConsumption += 1;
        break;
      case "Mixed":
        counts.mixed += 1;
        break;
      case "Unknown":
        counts.unknown += 1;
        break;
    }
  }

  return { counts, products };
}

function classifyOne(
  product: ProductSellingModelFields,
  observedSubscriptionTypes: string[]
): ProductSellingModelClassification {
  const base = { productId: product.id, productName: product.name };

  if (product.chargeType === "Usage" || product.hasConsumptionSchedule === true) {
    return {
      ...base,
      classification: "Usage/Consumption",
      confidence: "High",
      evidenceClass: "Observed",
      rationale: "Catalog field indicates usage/consumption-based charging.",
    };
  }

  if (product.chargeType === "One-Time") {
    const conflicting = observedSubscriptionTypes.filter(
      (t) => t !== "One-time"
    );
    if (conflicting.length > 0) {
      return {
        ...base,
        classification: "Mixed",
        confidence: "Medium",
        evidenceClass: "Observed",
        rationale: `Catalog marks this product One-Time, but it has been sold via recurring subscriptions (${conflicting.join(", ")}) -- conflicting evidence.`,
      };
    }
    return {
      ...base,
      classification: "One-Time",
      confidence: "High",
      evidenceClass: "Observed",
      rationale: "Catalog field indicates one-time charging, with no conflicting subscription history.",
    };
  }

  if (product.chargeType === "Recurring") {
    if (observedSubscriptionTypes.includes("One-time")) {
      return {
        ...base,
        classification: "Mixed",
        confidence: "Medium",
        evidenceClass: "Observed",
        rationale:
          "Catalog marks this product Recurring, but it has also been sold as a one-time subscription -- conflicting evidence.",
      };
    }
    if (
      observedSubscriptionTypes.includes("Evergreen") ||
      observedSubscriptionTypes.includes("Renewable/Evergreen")
    ) {
      return {
        ...base,
        classification: "Evergreen",
        confidence: "Medium",
        evidenceClass: "Inferred",
        rationale:
          "Catalog field indicates recurring charging; subscription history shows evergreen (open-ended) usage rather than a fixed term.",
      };
    }
    return {
      ...base,
      classification: "Term Subscription",
      confidence: product.productSubscriptionType === "Renewable" ? "High" : "Medium",
      evidenceClass: "Observed",
      rationale: "Catalog field indicates recurring, fixed-term charging.",
    };
  }

  if (product.chargeType === null) {
    if (observedSubscriptionTypes.length === 0) {
      return {
        ...base,
        classification: "Unknown",
        confidence: "Low",
        evidenceClass: "Observed",
        rationale:
          "No catalog selling-model field is populated and no subscription history was found for this product.",
      };
    }
    if (observedSubscriptionTypes.length === 1) {
      const value = observedSubscriptionTypes[0];
      if (value === "Evergreen" || value === "Renewable/Evergreen") {
        return {
          ...base,
          classification: "Evergreen",
          confidence: "Low",
          evidenceClass: "Inferred",
          rationale:
            "No catalog selling-model field is populated; the one subscription on record for this product is evergreen/open-ended.",
        };
      }
      if (value === "One-time") {
        return {
          ...base,
          classification: "One-Time",
          confidence: "Low",
          evidenceClass: "Inferred",
          rationale:
            "No catalog selling-model field is populated; the one subscription on record for this product is one-time.",
        };
      }
      if (value === "Renewable") {
        return {
          ...base,
          classification: "Term Subscription",
          confidence: "Low",
          evidenceClass: "Inferred",
          rationale:
            "No catalog selling-model field is populated; the one subscription on record for this product is a renewable term subscription.",
        };
      }
    }
    return {
      ...base,
      classification: "Mixed",
      confidence: "Medium",
      evidenceClass: "Inferred",
      rationale: `No catalog selling-model field is populated, and multiple different subscription types have been observed for this product (${observedSubscriptionTypes.join(", ")}).`,
    };
  }

  return {
    ...base,
    classification: "Unknown",
    confidence: "Low",
    evidenceClass: "Observed",
    rationale:
      "No catalog selling-model field is populated and no subscription history was found for this product.",
  };
}

export function buildSellingModelSection(raw: Record<string, InspectorResult>): string {
  const classified = classifySellingModels(raw);
  if (classified === null) {
    return `## Product Selling Model Readiness\n\n${failureNote(raw, "inspect_selling_model")}`;
  }

  const { counts, products } = classified;
  const lines: string[] = [];

  lines.push("## Product Selling Model Readiness");
  lines.push("");
  let opening = `Classified \`${counts.productsClassified}\` of \`${counts.productsTotalActive}\` active products by how they are actually sold, using catalog fields where populated and real subscription history otherwise.`;
  if (counts.productsClassified < counts.productsTotalActive) {
    opening += " This is a partial sample; totals below reflect only the classified subset.";
  }
  lines.push(opening);
  lines.push("");

  lines.push("### Classification breakdown");
  lines.push("");
  lines.push("| Selling model | Products |");
  lines.push("|---|---:|");
  lines.push(`| One-Time | ${counts.oneTime} |`);
  lines.push(`| Term Subscription | ${counts.termSubscription} |`);
  lines.push(`| Evergreen | ${counts.evergreen} |`);
  lines.push(`| Usage/Consumption | ${counts.usageConsumption} |`);
  lines.push(`| Mixed (conflicting evidence) | ${counts.mixed} |`);
  lines.push(`| Unknown (no evidence) | ${counts.unknown} |`);
  lines.push("");

  lines.push("### Products with conflicting selling-model evidence");
  lines.push("");
  const mixed = products.filter((p) => p.classification === "Mixed").slice(0, 5);
  if (mixed.length === 0) {
    lines.push("_No products with conflicting selling-model evidence were found._");
  } else {
    for (const p of mixed) {
      lines.push(`- **${md(p.productName)}**: ${p.rationale}`);
    }
  }
  lines.push("");

  lines.push("### Method note");
  lines.push("");
  lines.push(
    `_Classification uses Product2's own charge-type/subscription-type fields as primary evidence where populated, and falls back to each product's real Subscription record history where they are not. "Unknown" is a valid, honest outcome -- it is not treated as a default toward any other classification._`
  );

  return lines.join("\n");
}
