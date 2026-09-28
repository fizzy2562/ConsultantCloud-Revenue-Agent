import { NextResponse } from "next/server";
import {
  clearSalesforceSession,
  parseTarget,
  readStoredSession,
  refreshSalesforceSession,
  salesforceClientId,
} from "../../../../lib/salesforceSession";

export const runtime = "nodejs";

type Identity = { username: string; orgId: string; displayName: string };

async function fetchIdentity(instanceUrl: string, accessToken: string): Promise<Identity | null> {
  const response = await fetch(`${instanceUrl.replace(/\/$/, "")}/services/oauth2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { preferred_username?: string; organization_id?: string; name?: string };
  return {
    username: body.preferred_username ?? "unknown",
    orgId: body.organization_id ?? "unknown",
    displayName: body.name ?? "unknown",
  };
}

/** Who is signed in. Silently refreshes an expired access token when a refresh token is held. */
export async function GET(request: Request) {
  const target = parseTarget(new URL(request.url).searchParams.get("target"));
  const oauthConfigured = Boolean(salesforceClientId(target));
  let session = await readStoredSession(target);
  if (!session) return NextResponse.json({ connected: false, oauthConfigured });

  let identity = await fetchIdentity(session.instanceUrl, session.accessToken);
  if (!identity) {
    const refreshed = await refreshSalesforceSession(session, target);
    if (refreshed) {
      session = refreshed;
      identity = await fetchIdentity(session.instanceUrl, session.accessToken);
    }
  }
  if (!identity) {
    return NextResponse.json({ connected: false, oauthConfigured, error: "Your Salesforce session has expired. Sign in again." });
  }
  return NextResponse.json({ connected: true, oauthConfigured, instanceUrl: session.instanceUrl, identity });
}

export async function DELETE(request: Request) {
  await clearSalesforceSession(parseTarget(new URL(request.url).searchParams.get("target")));
  return NextResponse.json({ connected: false });
}
