import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyLinkTicket } from "../../../../lib/slack/links";
import { parseTarget, salesforceClientId, salesforceLoginUrl, salesforceRedirectUri, writeOAuthState } from "../../../../lib/salesforceSession";

export const runtime = "nodejs";

/** Starts "Sign in with Salesforce": OAuth 2.0 web server flow with PKCE, no client secret. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const target = parseTarget(params.get("target"));
  // From Slack's "Connect Salesforce" button: link the sign-in to that Slack user, not this browser.
  const slackTicket = params.get("slack");
  const slack = slackTicket ? verifyLinkTicket(slackTicket) : undefined;
  if (slackTicket && !slack) {
    return new NextResponse("This Slack sign-in link has expired. Run /quickpick in Slack again for a fresh one.", { status: 400 });
  }
  const clientId = salesforceClientId(target);
  if (!clientId) {
    return NextResponse.redirect(new URL("/?tab=connection&error=OAuth+is+not+configured+for+this+connection", request.url));
  }
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const redirectUri = salesforceRedirectUri(request.url);
  await writeOAuthState({ verifier, state, redirectUri, target, ...(slack ? { slack } : {}) });

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
