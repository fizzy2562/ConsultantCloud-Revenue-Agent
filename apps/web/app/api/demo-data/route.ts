import { resolveSalesforceCredentials } from "@consultantcloud/revenue-mcp";
import { Connection } from "jsforce";
import { resetDemoData, setUpDemoData } from "../../../lib/demoData";
import { envCredentialsAllowed, readSalesforceSession } from "../../../lib/salesforceSession";

export const runtime = "nodejs";
// Creating an order and its assets is asynchronous in Salesforce; the steps poll for up to ~2 minutes.
export const maxDuration = 180;

/** The Revenue Cloud org this request acts on: the signed-in session, else the env token where allowed. */
async function credentials() {
  const session = await readSalesforceSession();
  if (session) return session;
  return envCredentialsAllowed() ? resolveSalesforceCredentials() : null;
}

export async function GET() {
  const creds = await credentials();
  return Response.json(creds ? { available: true, instanceUrl: creds.instanceUrl } : { available: false });
}

export async function POST() {
  const creds = await credentials();
  if (!creds) {
    return Response.json({ error: "Connect a Revenue Cloud org first: sign in on the Connection tab." }, { status: 400 });
  }
  const conn = new Connection({ instanceUrl: creds.instanceUrl, accessToken: creds.accessToken, version: "62.0" });
  try {
    return Response.json({ steps: await setUpDemoData(conn) });
  } catch (error) {
    console.error("Demo data setup failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Demo data setup failed" }, { status: 502 });
  }
}

/** Reset: clear the demo accounts' quotes, orders and assets so setup can rebuild them. */
export async function DELETE() {
  const creds = await credentials();
  if (!creds) {
    return Response.json({ error: "Connect a Revenue Cloud org first: sign in on the Connection tab." }, { status: 400 });
  }
  const conn = new Connection({ instanceUrl: creds.instanceUrl, accessToken: creds.accessToken, version: "62.0" });
  try {
    return Response.json({ steps: await resetDemoData(conn) });
  } catch (error) {
    console.error("Demo data reset failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Demo data reset failed" }, { status: 502 });
  }
}
