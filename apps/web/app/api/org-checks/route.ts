import { resolveSalesforceCredentials } from "@consultantcloud/revenue-mcp";
import { runOrgChecks } from "../../../lib/orgChecks";
import { envCredentialsAllowed } from "../../../lib/salesforceSession";

export const runtime = "nodejs";
// Two model turns with a pause between them, to stay under free models' per-minute limits.
export const maxDuration = 300;

/**
 * The org checks against the deployment's own org (the tools API uses its SF_* credentials).
 * Available only where that org is in use: locally, or with ALLOW_ANONYMOUS_ORG_ACCESS.
 */
function availability(): { ok: true; key: string } | { ok: false; reason: string } {
  if (!envCredentialsAllowed() || !resolveSalesforceCredentials()) {
    return { ok: false, reason: "Org checks run against this deployment's own Salesforce org (SF_INSTANCE_URL and SF_ACCESS_TOKEN), which isn't in use here." };
  }
  const key = process.env.TOOLS_API_KEY;
  if (!key) return { ok: false, reason: "Set TOOLS_API_KEY: the checks call the tools API." };
  return { ok: true, key };
}

export async function GET() {
  const a = availability();
  return Response.json(a.ok ? { available: true } : { available: false, reason: a.reason });
}

export async function POST(request: Request) {
  const a = availability();
  if (!a.ok) return Response.json({ error: a.reason }, { status: 400 });
  const checks = await runOrgChecks({ baseUrl: new URL(request.url).origin, toolsKey: a.key });
  return Response.json({ checks });
}
