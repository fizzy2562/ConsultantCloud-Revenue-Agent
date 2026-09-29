import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Slack signs every request with the app's signing secret. Reject anything unsigned, forged or
 * older than five minutes (replay). `rawBody` must be the exact bytes Slack sent.
 */
export function verifySlackRequest(request: Request, rawBody: string): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");
  if (!secret || !timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class SlackApiError extends Error {}

/** Calls a Slack Web API method with the bot token. Throws on `ok: false` with Slack's own error code. */
export async function slack<T = Record<string, unknown>>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new SlackApiError("SLACK_BOT_TOKEN is not configured.");
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = (await response.json()) as { ok: boolean; error?: string; response_metadata?: { messages?: string[] } };
  if (!result.ok) {
    const detail = result.response_metadata?.messages?.join("; ");
    throw new SlackApiError(`${method}: ${result.error ?? response.status}${detail ? ` (${detail})` : ""}`);
  }
  return result as T;
}

/** Where Slack buttons send people back to this app. Pinned by env on Vercel, else the request origin. */
export function publicBaseUrl(requestUrl: string): string {
  return (process.env.PUBLIC_BASE_URL ?? new URL(requestUrl).origin).replace(/\/$/, "");
}
