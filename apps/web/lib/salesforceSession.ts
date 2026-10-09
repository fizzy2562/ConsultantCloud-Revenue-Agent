import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { SalesforceCredentials } from "@consultantcloud/revenue-mcp";

/**
 * Two separate Salesforce connections, each signed in with OAuth (PKCE, no client secret):
 *  - "revenue": the Revenue Cloud org the agent works against
 *  - "cpq":     the legacy CPQ source org the migration report inspects
 * They are different orgs, so each has its own External Client App, client id and cookie.
 */
export type Target = "revenue" | "cpq";

type TargetConfig = { cookie: string; clientIdEnv: string; loginUrlEnv: string; defaultLoginUrl: string };

const TARGETS: Record<Target, TargetConfig> = {
  revenue: {
    cookie: "sf_session",
    clientIdEnv: "SF_OAUTH_CLIENT_ID",
    loginUrlEnv: "SF_LOGIN_URL",
    defaultLoginUrl: "https://login.salesforce.com",
  },
  cpq: {
    cookie: "sf_cpq_session",
    clientIdEnv: "CPQ_OAUTH_CLIENT_ID",
    loginUrlEnv: "CPQ_LOGIN_URL",
    defaultLoginUrl: "https://login.salesforce.com",
  },
};

const OAUTH_COOKIE = "sf_oauth";

export type StoredSession = SalesforceCredentials & { refreshToken?: string };
/** `slack` is set when the sign-in links a Slack user rather than this browser (see lib/slack/links.ts). */
type OAuthState = { verifier: string; state: string; redirectUri: string; target: Target; slack?: { teamId: string; userId: string } };

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

/**
 * Cookies hold Salesforce access and refresh tokens, so they are AES-256-GCM encrypted (and
 * tamper-evident) with a key derived from SESSION_SECRET. Locally, without one, a random key
 * per server process is used: sign-ins then last until the dev server restarts.
 */
let devKey: Buffer | null = null;

function cookieKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (secret) return createHash("sha256").update(`sf-session:${secret}`).digest();
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not configured. Set it to a long random value (see .env.example).");
  }
  devKey ??= randomBytes(32);
  return devKey;
}

export function sealCookie(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cookieKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** Null for a missing, tampered, or pre-encryption cookie: the user is simply signed out. */
export function openCookie<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    const data = Buffer.from(raw, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", cookieKey(), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function readStoredSession(target: Target = "revenue"): Promise<StoredSession | null> {
  const stored = openCookie<StoredSession>((await cookies()).get(TARGETS[target].cookie)?.value);
  return stored?.instanceUrl && stored.accessToken ? stored : null;
}

/**
 * Whether a visitor who hasn't signed in may use the deployment's own SF_* / CPQ_* tokens.
 * Locally, yes: it's a developer running their own copy. On a hosted deployment, only when
 * ALLOW_ANONYMOUS_ORG_ACCESS=true; otherwise a public URL could read or change that org, and
 * visitors who haven't signed in get the built-in demo data instead.
 */
export function envCredentialsAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_ANONYMOUS_ORG_ACCESS === "true";
}

/** The credentials for this request, or null so the caller falls back to env/mock. */
export async function readSalesforceSession(target: Target = "revenue"): Promise<SalesforceCredentials | null> {
  const stored = await readStoredSession(target);
  return stored ? { instanceUrl: stored.instanceUrl, accessToken: stored.accessToken } : null;
}

/** httpOnly: page scripts can never read the token. Session cookie: gone when the browser closes. */
export async function writeSalesforceSession(session: StoredSession, target: Target = "revenue"): Promise<void> {
  (await cookies()).set(TARGETS[target].cookie, sealCookie(session), cookieOptions);
}

export async function clearSalesforceSession(target: Target = "revenue"): Promise<void> {
  (await cookies()).delete(TARGETS[target].cookie);
}

/** PKCE verifier, CSRF state and target for the round trip to Salesforce, valid for ten minutes. */
export async function writeOAuthState(state: OAuthState): Promise<void> {
  (await cookies()).set(OAUTH_COOKIE, sealCookie(state), { ...cookieOptions, maxAge: 600 });
}

export async function takeOAuthState(): Promise<OAuthState | null> {
  const jar = await cookies();
  const value = openCookie<OAuthState>(jar.get(OAUTH_COOKIE)?.value);
  jar.delete(OAUTH_COOKIE);
  return value;
}

/** Exchange a refresh token for a new access token. Pure: callers decide where the result is stored. */
export async function exchangeRefreshToken(stored: StoredSession, target: Target = "revenue"): Promise<StoredSession | null> {
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
  return { ...stored, accessToken: body.access_token, instanceUrl: body.instance_url ?? stored.instanceUrl };
}

/** Refresh the browser session, so a demo survives the session timeout. */
export async function refreshSalesforceSession(stored: StoredSession, target: Target = "revenue"): Promise<StoredSession | null> {
  const next = await exchangeRefreshToken(stored, target);
  if (next) await writeSalesforceSession(next, target);
  return next;
}
