import { cookies } from "next/headers";
import type { SalesforceCredentials } from "@consultantcloud/revenue-mcp";

/**
 * Two separate Salesforce connections, each signed in with OAuth (PKCE, no client secret):
 *  - "revenue": the Revenue Cloud org the agent works against (cc-revenue-org)
 *  - "cpq":     the legacy CPQ source org the migration report inspects (cpq-trailhead)
 * They are different orgs, so each has its own External Client App, client id and cookie.
 */
export type Target = "revenue" | "cpq";

type TargetConfig = { cookie: string; clientIdEnv: string; loginUrlEnv: string; defaultLoginUrl: string };

const TARGETS: Record<Target, TargetConfig> = {
  revenue: {
    cookie: "sf_session",
    clientIdEnv: "SF_OAUTH_CLIENT_ID",
    loginUrlEnv: "SF_LOGIN_URL",
    defaultLoginUrl: "https://trailhead-4d3-dev-ed.develop.my.salesforce.com",
  },
  cpq: {
    cookie: "sf_cpq_session",
    clientIdEnv: "CPQ_OAUTH_CLIENT_ID",
    loginUrlEnv: "CPQ_LOGIN_URL",
    defaultLoginUrl: "https://trailhead-4ab-dev-ed.develop.my.salesforce.com",
  },
};

const OAUTH_COOKIE = "sf_oauth";

type StoredSession = SalesforceCredentials & { refreshToken?: string };
type OAuthState = { verifier: string; state: string; redirectUri: string; target: Target };

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export function parseTarget(value: string | null | undefined): Target {
  return value === "cpq" ? "cpq" : "revenue";
}

export function salesforceLoginUrl(target: Target = "revenue"): string {
  const config = TARGETS[target];
  return (process.env[config.loginUrlEnv] ?? config.defaultLoginUrl).replace(/\/$/, "");
}

export function salesforceClientId(target: Target = "revenue"): string | null {
  return process.env[TARGETS[target].clientIdEnv] ?? null;
}

/** The registered callback. Pinned by env on Vercel, derived from the request origin locally. */
export function salesforceRedirectUri(requestUrl: string): string {
  return process.env.SF_OAUTH_REDIRECT_URI ?? `${new URL(requestUrl).origin}/api/auth/callback`;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decode<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function readStoredSession(target: Target = "revenue"): Promise<StoredSession | null> {
  const stored = decode<StoredSession>((await cookies()).get(TARGETS[target].cookie)?.value);
  return stored?.instanceUrl && stored.accessToken ? stored : null;
}

/** The credentials for this request, or null so the caller falls back to env/mock. */
export async function readSalesforceSession(target: Target = "revenue"): Promise<SalesforceCredentials | null> {
  const stored = await readStoredSession(target);
  return stored ? { instanceUrl: stored.instanceUrl, accessToken: stored.accessToken } : null;
}

/** httpOnly: page scripts can never read the token. Session cookie: gone when the browser closes. */
export async function writeSalesforceSession(session: StoredSession, target: Target = "revenue"): Promise<void> {
  (await cookies()).set(TARGETS[target].cookie, encode(session), cookieOptions);
}

export async function clearSalesforceSession(target: Target = "revenue"): Promise<void> {
  (await cookies()).delete(TARGETS[target].cookie);
}

/** PKCE verifier, CSRF state and target for the round trip to Salesforce, valid for ten minutes. */
export async function writeOAuthState(state: OAuthState): Promise<void> {
  (await cookies()).set(OAUTH_COOKIE, encode(state), { ...cookieOptions, maxAge: 600 });
}

export async function takeOAuthState(): Promise<OAuthState | null> {
  const jar = await cookies();
  const value = decode<OAuthState>(jar.get(OAUTH_COOKIE)?.value);
  jar.delete(OAUTH_COOKIE);
  return value;
}

/** Exchange a refresh token for a new access token, so a demo survives the session timeout. */
export async function refreshSalesforceSession(stored: StoredSession, target: Target = "revenue"): Promise<StoredSession | null> {
  const clientId = salesforceClientId(target);
  if (!stored.refreshToken || !clientId) return null;
  const response = await fetch(`${salesforceLoginUrl(target)}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: stored.refreshToken }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { access_token?: string; instance_url?: string };
  if (!body.access_token) return null;
  const next = { ...stored, accessToken: body.access_token, instanceUrl: body.instance_url ?? stored.instanceUrl };
  await writeSalesforceSession(next, target);
  return next;
}
