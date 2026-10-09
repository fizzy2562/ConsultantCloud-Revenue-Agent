/**
 * A visitor's own model API key ("bring your own key"). Kept in sessionStorage, so it lasts only
 * as long as the browser tab, and sent as a header with each chat request. The server passes it
 * to the configured model API for that request and never stores or logs it.
 */
const KEY = "cc-llm-api-key";
const MODEL = "cc-llm-model";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readModelKey(): { apiKey: string; model: string } | null {
  const apiKey = storage()?.getItem(KEY) ?? "";
  return apiKey ? { apiKey, model: storage()?.getItem(MODEL) ?? "" } : null;
}

export function saveModelKey(apiKey: string, model: string): void {
  storage()?.setItem(KEY, apiKey.trim());
  if (model.trim()) storage()?.setItem(MODEL, model.trim());
  else storage()?.removeItem(MODEL);
}

export function clearModelKey(): void {
  storage()?.removeItem(KEY);
  storage()?.removeItem(MODEL);
}

export function modelKeyHeaders(): Record<string, string> {
  const own = readModelKey();
  if (!own) return {};
  return { "x-llm-api-key": own.apiKey, ...(own.model ? { "x-llm-model": own.model } : {}) };
}

/** "sk-or-…a1b2": enough to recognise the key without showing it. */
export function maskKey(apiKey: string): string {
  return apiKey.length > 12 ? `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}` : "…";
}
