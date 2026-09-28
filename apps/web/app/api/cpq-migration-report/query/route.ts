import { cpqInspectors } from "@consultantcloud/cpq-analysis";
import { Connection } from "jsforce";
import { readStoredSession, refreshSalesforceSession } from "../../../../lib/salesforceSession";

export const runtime = "nodejs";
export const maxDuration = 30;

function failedInspector(error: unknown) {
  return {
    ok: false as const,
    error: { code: "INSPECTOR_ERROR", message: error instanceof Error ? error.message : String(error), retryable: true },
    meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "salesforce" as const },
  };
}

/**
 * Credentials for the CPQ source org: the signed-in OAuth session first (refreshed if it has
 * expired), then the static CPQ_* env vars as a fallback. A stale static token is exactly what
 * produced "INVALID_SESSION_ID: Session expired or invalid" on every inspector.
 */
async function cpqCredentials(): Promise<{ instanceUrl: string; accessToken: string } | null> {
  const stored = await readStoredSession("cpq");
  if (stored) {
    const probe = await fetch(`${stored.instanceUrl}/services/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${stored.accessToken}` },
      cache: "no-store",
    });
    if (probe.ok) return stored;
    const refreshed = await refreshSalesforceSession(stored, "cpq");
    if (refreshed) return refreshed;
  }
  const instanceUrl = process.env.CPQ_INSTANCE_URL;
  const accessToken = process.env.CPQ_ACCESS_TOKEN;
  return instanceUrl && accessToken ? { instanceUrl, accessToken } : null;
}

export async function POST() {
  const credentials = await cpqCredentials();
  if (!credentials) {
    return Response.json(
      { error: "CPQ org not connected. Open the Connection tab and sign in to the CPQ source org." },
      { status: 503 }
    );
  }

  const connection = new Connection({ instanceUrl: credentials.instanceUrl, accessToken: credentials.accessToken, version: "67.0" });
  const entries = await Promise.all(cpqInspectors.map(async ({ tool, handler }) => {
    try {
      return [tool.name, await handler(connection, {})] as const;
    } catch (error) {
      return [tool.name, failedInspector(error)] as const;
    }
  }));
  return Response.json({ raw: Object.fromEntries(entries) });
}
