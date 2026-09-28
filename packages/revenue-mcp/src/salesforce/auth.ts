import { Connection } from "jsforce";

/** Credentials for one request, e.g. from a signed-in browser session rather than the environment. */
export type SalesforceCredentials = {
  instanceUrl: string;
  accessToken: string;
};

/** Falls back to the environment when no per-request credentials are supplied. */
export function resolveSalesforceCredentials(creds?: SalesforceCredentials): SalesforceCredentials | null {
  const instanceUrl = creds?.instanceUrl ?? process.env.SF_INSTANCE_URL;
  const accessToken = creds?.accessToken ?? process.env.SF_ACCESS_TOKEN;
  if (!instanceUrl || !accessToken) return null;
  return { instanceUrl, accessToken };
}

export function createSalesforceConnection(creds?: SalesforceCredentials): Connection {
  const resolved = resolveSalesforceCredentials(creds);

  if (!resolved) {
    throw new Error(
      "No Salesforce credentials. Sign in on the Connection tab, or set SF_INSTANCE_URL and " +
        "SF_ACCESS_TOKEN (see .env.example). A session token is a demo shortcut; production use " +
        "should replace this with JWT Bearer or Client Credentials flow."
    );
  }

  return new Connection({ instanceUrl: resolved.instanceUrl, accessToken: resolved.accessToken, version: "62.0" });
}
