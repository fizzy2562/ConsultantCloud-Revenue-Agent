import { BridgeRevenueAdapter, type RevenuePickerBridge } from "@revenue-picker/salesforce-revenue";
import { exchangeRefreshToken, type StoredSession } from "../salesforceSession";
import { loadLink, saveLink, type SlackUser } from "./links";

export class NotLinkedError extends Error {
  constructor() {
    super("Salesforce is not connected for this Slack user.");
  }
}

export type QuoteRow = { Id: string; QuoteNumber: string; Name: string; Status: string; Account?: { Name: string } | null };

/**
 * Server-side twin of the Quick Pick UI Bundle's restBridge: the same Apex REST resource
 * (/services/apexrest/revenuePicker/...), so Slack runs exactly the logic the Lightning page does,
 * authenticated as the Slack user's own Salesforce sign-in instead of the browser session.
 */
export async function salesforceFor(user: SlackUser) {
  let session: StoredSession | null = await loadLink(user);
  if (!session) throw new NotLinkedError();

  async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
    const response = await fetch(`${session!.instanceUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${session!.accessToken}`, "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
    if (response.status === 401 && !retried) {
      const next = await exchangeRefreshToken(session!);
      if (!next) throw new NotLinkedError();
      session = next;
      await saveLink(user, next);
      return request<T>(path, init, true);
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = Array.isArray(body) ? body[0]?.message : (body as { message?: string } | null)?.message;
      throw new Error(message ?? `Salesforce request failed (HTTP ${response.status}).`);
    }
    return body as T;
  }

  const call = <T>(path: string, init?: RequestInit) => request<T>(`/services/apexrest/revenuePicker/${path}`, init);
  const post = <T>(path: string, body: unknown) => call<T>(path, { method: "POST", body: JSON.stringify(body) });
  const qs = (params: Record<string, string | null | undefined>) => {
    const entries = Object.entries(params).filter(([, v]) => v != null) as [string, string][];
    return entries.length ? `?${new URLSearchParams(entries)}` : "";
  };

  const bridge: RevenuePickerBridge = {
    getActiveBundles: () => call("bundles"),
    ensureRootLine: async (quoteId, productId) => (await post<{ rootLineId: string }>("rootLine", { quoteId, productId })).rootLineId,
    getState: (quoteId, rootLineId) => call(`state${qs({ quoteId, rootLineId })}`),
    applyChange: async (quoteId, rootLineId, changeType, groupId, optionId, attributeId, value, quantity) => {
      await post("change", { quoteId, rootLineId, changeType, groupId, optionId, attributeId, value, quantity });
    },
    startSession: (quoteId, productId) => post("startSession", { quoteId, productId }),
    getCatalog: (quoteId, productId) => call(`catalog${qs({ quoteId, productId })}`),
    applyChangeAndGetState: (quoteId, rootLineId, changeType, groupId, optionId, attributeId, value, quantity, includeCatalog) =>
      post("changeAndState", { quoteId, rootLineId, changeType, groupId, optionId, attributeId, value, quantity, includeCatalog }),
    applyChangesAndGetState: (quoteId, rootLineId, changes, includeCatalog) =>
      post("changesAndState", { quoteId, rootLineId, changes, includeCatalog }),
    getPricing: (quoteId, rootLineId) => call(`pricing${qs({ quoteId, rootLineId })}`),
    validateTransaction: (quoteId, rootLineId) => call(`validate${qs({ quoteId, rootLineId })}`),
    validate: (quoteId, rootLineId) => call(`validateVerdict${qs({ quoteId, rootLineId })}`),
    getQuoteSummary: (quoteId) => call(`quote${qs({ quoteId })}`),
    getRules: (productId) => call(`rules${qs({ productId })}`),
    getPriceBreakdown: (quoteId, rootLineId) => call(`breakdown${qs({ quoteId, rootLineId })}`),
    getQuoteBundles: (quoteId) => call(`quoteBundles${qs({ quoteId })}`),
    removeBundle: async (quoteId, rootLineId) => {
      await post("removeBundle", { quoteId, rootLineId });
    },
  };

  async function soql<T>(query: string): Promise<T[]> {
    const result = await request<{ records: T[] }>(`/services/data/v67.0/query?q=${encodeURIComponent(query)}`);
    return result.records;
  }

  return {
    bridge,
    adapter: new BridgeRevenueAdapter(bridge),
    instanceUrl: () => session!.instanceUrl,
    recentQuotes: () =>
      soql<QuoteRow>("SELECT Id, QuoteNumber, Name, Status, Account.Name FROM Quote ORDER BY LastModifiedDate DESC LIMIT 25"),
    findQuote: async (numberOrId: string) => {
      const safe = numberOrId.replace(/[^A-Za-z0-9]/g, "");
      if (!safe) return null;
      const where = /^0Q0[A-Za-z0-9]{12,15}$/.test(safe) ? `Id = '${safe}'` : `QuoteNumber = '${safe.padStart(8, "0")}'`;
      return (await soql<QuoteRow>(`SELECT Id, QuoteNumber, Name, Status, Account.Name FROM Quote WHERE ${where} LIMIT 1`))[0] ?? null;
    },
  };
}

export type SalesforceForSlack = Awaited<ReturnType<typeof salesforceFor>>;
