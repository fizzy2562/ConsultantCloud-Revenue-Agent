import { cpqInspectors } from "@consultantcloud/cpq-analysis";
import { Connection } from "jsforce";

export const runtime = "nodejs";
export const maxDuration = 30;

function failedInspector(error: unknown) {
  return {
    ok: false as const,
    error: { code: "INSPECTOR_ERROR", message: error instanceof Error ? error.message : String(error), retryable: true },
    meta: { requestId: crypto.randomUUID(), durationMs: 0, source: "salesforce" as const },
  };
}

export async function POST() {
  const instanceUrl = process.env.CPQ_INSTANCE_URL;
  const accessToken = process.env.CPQ_ACCESS_TOKEN;
  if (!instanceUrl || !accessToken) {
    return Response.json({ error: "CPQ org not configured" }, { status: 503 });
  }

  const connection = new Connection({ instanceUrl, accessToken, version: "67.0" });
  const entries = await Promise.all(cpqInspectors.map(async ({ tool, handler }) => {
    try {
      return [tool.name, await handler(connection, {})] as const;
    } catch (error) {
      return [tool.name, failedInspector(error)] as const;
    }
  }));
  return Response.json({ raw: Object.fromEntries(entries) });
}
