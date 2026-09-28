import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { parseTarget, salesforceClientId, salesforceLoginUrl, salesforceRedirectUri, writeOAuthState } from "../../../../lib/salesforceSession";

export const runtime = "nodejs";

/** Starts "Sign in with Salesforce": OAuth 2.0 web server flow with PKCE, no client secret. */
export async function GET(request: Request) {
  const target = parseTarget(new URL(request.url).searchParams.get("target"));
  const clientId = salesforceClientId(target);
  if (!clientId) {
    return NextResponse.redirect(new URL("/?tab=connection&error=OAuth+is+not+configured+for+this+connection", request.url));
  }
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const redirectUri = salesforceRedirectUri(request.url);
  await writeOAuthState({ verifier, state, redirectUri, target });

  const authorize = new URL(`${salesforceLoginUrl(target)}/services/oauth2/authorize`);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "api refresh_token openid",
    state,
    prompt: "login consent",
  }).toString();
  return NextResponse.redirect(authorize);
}
