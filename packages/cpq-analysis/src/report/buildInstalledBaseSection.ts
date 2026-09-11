import type { InspectorResult } from "./buildInventorySection";

interface ContractSummary {
  id: string;
  contractNumber: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  contractTerm: number | null;
  evergreen: boolean;
  masterContract: boolean;
}

interface SubscriptionSummary {
  id: string;
  name: string;
  product: string | null;
  contract: string | null;
  startDate: string | null;
  endDate: string | null;
  subscriptionType: string | null;
  quantity: number | null;
  revisedSubscription: string | null;
  terminatedDate: string | null;
}

interface AssetSummary {
  id: string;
  name: string;
  status: string | null;
  product: string | null;
  currentSubscription: string | null;
}

interface RenewalAmendmentQuoteSummary {
  id: string;
  type: string | null;
  status: string | null;
  masterContract: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface InstalledBaseCounts {
  contractsTotal: number;
  contractsActivatedTotal: number;
  contractsDueRenewalWithin90Days: number;
  contractsEvergreen: number;
  subscriptionsTotal: number;
  subscriptionsAmended: number;
  subscriptionsCancelled: number;
  subscriptionsEvergreenType: number;
  assetsTotal: number;
  renewalQuotesTotal: number;
  amendmentQuotesTotal: number;
}

interface InspectInstalledBaseData {
  counts: InstalledBaseCounts;
  contracts: ContractSummary[];
  subscriptions: SubscriptionSummary[];
  assets: AssetSummary[];
  renewalAmendmentQuotes: RenewalAmendmentQuoteSummary[];
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

export function buildInstalledBaseSection(raw: Record<string, InspectorResult>): string {
  const lines: string[] = [];
  lines.push("## Installed Base Assessment");
  lines.push("");

  const data = getOkData<InspectInstalledBaseData>(raw, "inspect_installed_base");
  if (!data) {
    lines.push(failureNote(raw, "inspect_installed_base"));
    lines.push("");
    return lines.join("\n");
  }

  const { counts } = data;
  lines.push(
    `This org has ${plural(counts.contractsTotal, "Contract")} (${counts.contractsActivatedTotal} Activated), ${plural(counts.subscriptionsTotal, "Subscription")}, and ${plural(counts.assetsTotal, "Asset")} under management.`
  );
  lines.push("");

  lines.push("### Renewals and lifecycle");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|---|---:|");
  lines.push(`| Contracts due for renewal within 90 days | ${counts.contractsDueRenewalWithin90Days} |`);
  lines.push(`| Evergreen contracts | ${counts.contractsEvergreen} |`);
  lines.push(`| Amended subscriptions | ${counts.subscriptionsAmended} |`);
  lines.push(`| Cancelled subscriptions | ${counts.subscriptionsCancelled} |`);
  lines.push(`| Evergreen-type subscriptions | ${counts.subscriptionsEvergreenType} |`);
  lines.push(`| Renewal quotes in flight | ${counts.renewalQuotesTotal} |`);
  lines.push(`| Amendment quotes in flight | ${counts.amendmentQuotesTotal} |`);
  lines.push("");
  lines.push("These counts are exact org-wide totals (SOQL aggregate queries), not estimates from a sample.");
  lines.push("");

  lines.push("### Contracts approaching renewal");
  lines.push("");
  const upcoming = data.contracts.filter((c) => c.endDate !== null).slice(0, 5);
  if (upcoming.length === 0) {
    lines.push("_No contracts with a known end date were found in the sample._");
  } else {
    for (const contract of upcoming) {
      const label = contract.contractNumber !== null ? contract.contractNumber : contract.id;
      const suffixes: string[] = [];
      if (contract.evergreen) {
        suffixes.push("evergreen");
      }
      if (contract.masterContract) {
        suffixes.push("master contract");
      }
      const suffix = suffixes.length > 0 ? `, ${suffixes.join(", ")}` : "";
      const term = contract.contractTerm !== null ? String(contract.contractTerm) : null;
      lines.push(
        `- **${label}** — ends ${md(contract.endDate)}, ${md(term)}-month term${suffix}.`
      );
    }
  }
  lines.push("");

  lines.push("### Amendments and cancellations");
  lines.push("");
  const amended = data.subscriptions.filter((s) => s.revisedSubscription !== null).slice(0, 3);
  if (amended.length === 0) {
    lines.push("_No amendment subscriptions found in the sample._");
  } else {
    for (const sub of amended) {
      lines.push(`- **${sub.name}** amends subscription \`${sub.revisedSubscription}\` (started ${md(sub.startDate)}).`);
    }
  }
  lines.push("");
  const cancelled = data.subscriptions.filter((s) => s.terminatedDate !== null).slice(0, 3);
  if (cancelled.length === 0) {
    lines.push("_No cancelled subscriptions found in the sample._");
  } else {
    for (const sub of cancelled) {
      lines.push(`- **${sub.name}** was cancelled on ${md(sub.terminatedDate)}.`);
    }
  }
  lines.push("");

  lines.push("### Method note");
  lines.push("");
  lines.push(
    "_Contract, Subscription, Asset, and Quote counts above are exact aggregate totals. The individual records listed are a bounded illustrative sample only (up to 25-50 records per category) and should not be read as the complete list._"
  );
  lines.push("");

  return lines.join("\n");
}
