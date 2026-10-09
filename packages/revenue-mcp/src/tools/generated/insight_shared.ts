import type { Connection } from "jsforce";

/** Shared plumbing for the "business job" tools (diagnose, explain, 360, history). */

export type Meta = { requestId: string; durationMs: number; source: "salesforce" };
export type Result<T> =
  | { ok: true; data: T; meta: Meta }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; meta: Meta };

export function meta(): Meta {
  return { requestId: crypto.randomUUID(), durationMs: 0, source: "salesforce" };
}

export function escapeSoql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function failure<T>(err: unknown, code = "SALESFORCE_ERROR"): Result<T> {
  return { ok: false, error: { code, message: err instanceof Error ? err.message : String(err), retryable: true }, meta: meta() };
}

export async function records<T = any>(conn: Connection, soql: string): Promise<T[]> {
  return (await conn.query<Record<string, any>>(soql)).records as T[];
}

/**
 * A section that may not exist in every org (Billing, Contracts, ...): its records, or a note
 * saying why it couldn't be read, so one missing feature never sinks the whole answer.
 */
export async function optionalSection<T>(read: () => Promise<T>): Promise<{ available: true; data: T } | { available: false; note: string }> {
  try {
    return { available: true, data: await read() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { available: false, note: /INVALID_TYPE|sObject type .* is not supported|No such column/i.test(message) ? "not available in this org" : message.slice(0, 200) };
  }
}

export const today = () => new Date().toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
