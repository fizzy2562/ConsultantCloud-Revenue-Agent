import type { InspectorResult } from "./buildInventorySection";

interface ProductUsageCount {
  productId: string;
  quoteLineCountAllTime: number;
  quoteLineCountLast365Days: number;
}

interface InspectQuoteUsageData {
  quoteLinesTotal: number;
  earliestQuoteLineDate: string | null;
  latestQuoteLineDate: string | null;
  productUsage: ProductUsageCount[];
}

interface InspectCatalogStructureData {
  products: Array<{
    id: string;
    name: string;
    productCode: string | null;
    family: string | null;
    isActive: boolean;
  }>;
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

export function buildUsageAnalyticsSection(raw: Record<string, InspectorResult>): string {
  const lines: string[] = [];
  lines.push("## Quote Usage Analytics");
  lines.push("");

  const usage = getOkData<InspectQuoteUsageData>(raw, "inspect_quote_usage");
  if (!usage) {
    lines.push(failureNote(raw, "inspect_quote_usage"));
    return lines.join("\n");
  }

  const catalog = getOkData<InspectCatalogStructureData>(raw, "inspect_catalog_structure");

  const earliest = usage.earliestQuoteLineDate;
  const latest = usage.latestQuoteLineDate;

  if (earliest === null || latest === null) {
    lines.push("_No Quote Line data was found in this org -- usage analytics cannot be produced._");
    return lines.join("\n");
  }

  const spanDays = Math.floor((new Date(latest).getTime() - new Date(earliest).getTime()) / 86400000);
  if (spanDays < 30) {
    lines.push(
      `**Data window caveat:** this org's Quote Line history spans only ${plural(spanDays, "day")} (${earliest} to ${latest}) -- far too short to represent real trading history. Usage figures below describe this demo dataset, not a customer's actual quoting patterns; treat "never quoted" as "never quoted in the available sample," not as a reliable retirement signal on its own.`,
    );
    lines.push("");
  }

  const quotedIds = new Set(usage.productUsage.map((p) => p.productId));
  const catalogTotal = catalog ? catalog.products.length : 0;
  const quotedAtLeastOnce = usage.productUsage.length;
  const neverQuoted = catalog
    ? catalog.products.filter((p) => !quotedIds.has(p.id)).length
    : 0;
  const quotedInLast365Days = usage.productUsage.filter((p) => p.quoteLineCountLast365Days > 0).length;

  lines.push("### Product usage summary");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|---|---:|");
  lines.push(`| Total Quote Lines | ${usage.quoteLinesTotal} |`);
  lines.push(`| Products in catalog | ${catalogTotal} |`);
  lines.push(`| Products quoted at least once (all-time) | ${quotedAtLeastOnce} |`);
  lines.push(`| Products quoted in the last 365 days | ${quotedInLast365Days} |`);
  lines.push(`| Products never quoted | ${neverQuoted} |`);
  lines.push("");

  lines.push("### Rationalization candidates (never quoted)");
  lines.push("");
  if (!catalog) {
    lines.push(
      "_Catalog data is unavailable, so which specific products have never been quoted cannot be determined._",
    );
  } else {
    const candidates = catalog.products.filter((p) => !quotedIds.has(p.id)).slice(0, 10);
    if (candidates.length === 0) {
      lines.push("_Every active product in the catalog has been quoted at least once._");
    } else {
      for (const p of candidates) {
        const code = p.productCode ?? p.id;
        lines.push(`- **${md(p.name)}** (${code}) — ${p.family ?? "no family set"}.`);
      }
    }
  }
  lines.push("");

  lines.push("### Method note");
  lines.push("");
  lines.push(
    "_This section reports actual quoting activity per product from real Quote Line records -- it does not estimate or infer usage for Price Rules, Discount Schedules, or Product Rules, because CPQ provides no field linking a Quote Line back to the rule or schedule that affected its price. Any claim about \"how often a rule was used\" would not be observable from this data and is deliberately not attempted._",
  );
  lines.push("");
  lines.push(
    "_\"Never quoted\" identifies rationalization candidates for stakeholder review, not final retirement decisions -- a product with no observed usage in this sample may still be actively sold outside the window captured here._",
  );

  return lines.join("\n");
}
