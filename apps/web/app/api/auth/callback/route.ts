import { NextResponse } from "next/server";
import { salesforceClientId, salesforceLoginUrl, takeOAuthState, writeSalesforceSession } from "../../../../lib/salesforceSession";

export const runtime = "nodejs";

function back(request: Request, error?: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("tab", "connection");
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

/** Salesforce redirects here with ?code; exchange it (PKCE) and store the session. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get("error")) return back(request, params.get("error_description") ?? params.get("error") ?? "Sign-in was cancelled.");

  const saved = await takeOAuthState();
  const code = params.get("code");
  const target = saved?.target ?? "revenue";
  const clientId = salesforceClientId(target);
  if (!saved || !code || !clientId || params.get("state") !== saved.state) {
    return back(request, "Sign-in expired or was tampered with. Please try again.");
  }

  const response = await fetch(`${salesforceLoginUrl(target)}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: saved.redirectUri,
      code_verifier: saved.verifier,
    }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    instance_url?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token || !body.instance_url) {
    return back(request, body.error_description ?? `Token exchange failed (HTTP ${response.status}).`);
  }

  await writeSalesforceSession({
    instanceUrl: body.instance_url,
    accessToken: body.access_token,
    ...(body.refresh_token ? { refreshToken: body.refresh_token } : {}),
  }, target);
  return back(request);
}
