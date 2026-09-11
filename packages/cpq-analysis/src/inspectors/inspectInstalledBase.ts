import type { Connection } from "jsforce";

function meta(source: "salesforce" = "salesforce") {
  return { requestId: crypto.randomUUID(), durationMs: 0, source };
}

export interface ContractSummary {
  id: string;
  contractNumber: string | null;
  status: string | null;
  startDate: string | null;
  endDate: string | null;
  contractTerm: number | null;
  evergreen: boolean;
  masterContract: boolean;
}

export interface SubscriptionSummary {
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

export interface AssetSummary {
  id: string;
  name: string;
  status: string | null;
  product: string | null;
  currentSubscription: string | null;
}

export interface RenewalAmendmentQuoteSummary {
  id: string;
  type: string | null;
  status: string | null;
  masterContract: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface InstalledBaseCounts {
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

export interface InspectInstalledBaseData {
  counts: InstalledBaseCounts;
  contracts: ContractSummary[];
  subscriptions: SubscriptionSummary[];
  assets: AssetSummary[];
  renewalAmendmentQuotes: RenewalAmendmentQuoteSummary[];
}

export type InspectInstalledBaseResult =
  | { ok: true; data: InspectInstalledBaseData; meta: { requestId: string; durationMs: number; source: "salesforce" } }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: { requestId: string; durationMs: number; source: "salesforce" } };

export const inspectInstalledBaseTool = {
  name: "inspect_installed_base",
  title: "Inspect Installed Base",
  description: "Inventories the org's live installed base -- Contracts, Subscriptions, Assets, and Renewal/Amendment Quotes -- with exact aggregate counts (not capped samples) for every metric, plus a small bounded sample of each for illustration. Read-only.",
  kind: "read" as const,
  inputSchema: { type: "object", properties: {}, required: [] },
};

export async function inspectInstalledBaseHandler(conn: Connection, input: Record<string, never>): Promise<InspectInstalledBaseResult> {
  // Unlike the other inspectors (which query bounded configuration metadata), installed-base
  // data is unbounded in a real org, so every count is a server-side SOQL COUNT() aggregate
  // rather than a client-side filter over a capped LIMIT sample.
  try {
    const [
      contractsTotalResult,
      contractsActivatedTotalResult,
      contractsDueRenewalWithin90DaysResult,
      contractsEvergreenResult,
      subscriptionsTotalResult,
      subscriptionsAmendedResult,
      subscriptionsCancelledResult,
      subscriptionsEvergreenTypeResult,
      assetsTotalResult,
      renewalQuotesTotalResult,
      amendmentQuotesTotalResult,
      contractsSampleResult,
      subscriptionsSampleResult,
      assetsSampleResult,
      renewalAmendmentQuotesSampleResult,
    ] = await Promise.all([
      conn.query<any>(`SELECT COUNT() FROM Contract`),
      conn.query<any>(`SELECT COUNT() FROM Contract WHERE Status = 'Activated'`),
      conn.query<any>(`SELECT COUNT() FROM Contract WHERE Status = 'Activated' AND EndDate != null AND EndDate >= TODAY AND EndDate <= NEXT_N_DAYS:90`),
      conn.query<any>(`SELECT COUNT() FROM Contract WHERE SBQQ__Evergreen__c = true`),
      conn.query<any>(`SELECT COUNT() FROM SBQQ__Subscription__c`),
      conn.query<any>(`SELECT COUNT() FROM SBQQ__Subscription__c WHERE SBQQ__RevisedSubscription__c != null`),
      conn.query<any>(`SELECT COUNT() FROM SBQQ__Subscription__c WHERE SBQQ__TerminatedDate__c != null`),
      conn.query<any>(`SELECT COUNT() FROM SBQQ__Subscription__c WHERE SBQQ__SubscriptionType__c = 'Evergreen'`),
      conn.query<any>(`SELECT COUNT() FROM Asset`),
      conn.query<any>(`SELECT COUNT() FROM SBQQ__Quote__c WHERE SBQQ__Type__c = 'Renewal'`),
      conn.query<any>(`SELECT COUNT() FROM SBQQ__Quote__c WHERE SBQQ__Type__c = 'Amendment'`),
      conn.query<any>(`SELECT Id, ContractNumber, Status, StartDate, EndDate, ContractTerm, SBQQ__Evergreen__c, SBQQ__MasterContract__c FROM Contract WHERE Status = 'Activated' ORDER BY EndDate ASC NULLS LAST LIMIT 25`),
      conn.query<any>(`SELECT Id, Name, SBQQ__Product__c, SBQQ__Contract__c, SBQQ__SubscriptionStartDate__c, SBQQ__SubscriptionEndDate__c, SBQQ__SubscriptionType__c, SBQQ__Quantity__c, SBQQ__RevisedSubscription__c, SBQQ__TerminatedDate__c FROM SBQQ__Subscription__c ORDER BY SBQQ__SubscriptionStartDate__c DESC NULLS LAST LIMIT 50`),
      conn.query<any>(`SELECT Id, Name, Status, Product2Id, SBQQ__CurrentSubscription__c FROM Asset ORDER BY Name ASC LIMIT 25`),
      conn.query<any>(`SELECT Id, SBQQ__Type__c, SBQQ__Status__c, SBQQ__MasterContract__c, SBQQ__StartDate__c, SBQQ__EndDate__c FROM SBQQ__Quote__c WHERE SBQQ__Type__c IN ('Renewal', 'Amendment') ORDER BY SBQQ__StartDate__c ASC NULLS LAST LIMIT 25`),
    ]);

    const counts: InstalledBaseCounts = {
      contractsTotal: contractsTotalResult.totalSize,
      contractsActivatedTotal: contractsActivatedTotalResult.totalSize,
      contractsDueRenewalWithin90Days: contractsDueRenewalWithin90DaysResult.totalSize,
      contractsEvergreen: contractsEvergreenResult.totalSize,
      subscriptionsTotal: subscriptionsTotalResult.totalSize,
      subscriptionsAmended: subscriptionsAmendedResult.totalSize,
      subscriptionsCancelled: subscriptionsCancelledResult.totalSize,
      subscriptionsEvergreenType: subscriptionsEvergreenTypeResult.totalSize,
      assetsTotal: assetsTotalResult.totalSize,
      renewalQuotesTotal: renewalQuotesTotalResult.totalSize,
      amendmentQuotesTotal: amendmentQuotesTotalResult.totalSize,
    };

    const contracts: ContractSummary[] = contractsSampleResult.records.map((row) => ({
      id: row.Id,
      contractNumber: row.ContractNumber ?? null,
      status: row.Status ?? null,
      startDate: row.StartDate ?? null,
      endDate: row.EndDate ?? null,
      contractTerm: row.ContractTerm ?? null,
      evergreen: row.SBQQ__Evergreen__c === true,
      masterContract: row.SBQQ__MasterContract__c === true,
    }));

    const subscriptions: SubscriptionSummary[] = subscriptionsSampleResult.records.map((row) => ({
      id: row.Id,
      name: row.Name,
      product: row.SBQQ__Product__c ?? null,
      contract: row.SBQQ__Contract__c ?? null,
      startDate: row.SBQQ__SubscriptionStartDate__c ?? null,
      endDate: row.SBQQ__SubscriptionEndDate__c ?? null,
      subscriptionType: row.SBQQ__SubscriptionType__c ?? null,
      quantity: row.SBQQ__Quantity__c ?? null,
      revisedSubscription: row.SBQQ__RevisedSubscription__c ?? null,
      terminatedDate: row.SBQQ__TerminatedDate__c ?? null,
    }));

    const assets: AssetSummary[] = assetsSampleResult.records.map((row) => ({
      id: row.Id,
      name: row.Name,
      status: row.Status ?? null,
      product: row.Product2Id ?? null,
      currentSubscription: row.SBQQ__CurrentSubscription__c ?? null,
    }));

    const renewalAmendmentQuotes: RenewalAmendmentQuoteSummary[] = renewalAmendmentQuotesSampleResult.records.map((row) => ({
      id: row.Id,
      type: row.SBQQ__Type__c ?? null,
      status: row.SBQQ__Status__c ?? null,
      masterContract: row.SBQQ__MasterContract__c ?? null,
      startDate: row.SBQQ__StartDate__c ?? null,
      endDate: row.SBQQ__EndDate__c ?? null,
    }));

    const data: InspectInstalledBaseData = {
      counts,
      contracts,
      subscriptions,
      assets,
      renewalAmendmentQuotes,
    };

    return { ok: true, data, meta: meta() };
  } catch (err) {
    return { ok: false, error: { code: "SALESFORCE_ERROR", message: String(err), retryable: true }, meta: meta() };
  }
}
