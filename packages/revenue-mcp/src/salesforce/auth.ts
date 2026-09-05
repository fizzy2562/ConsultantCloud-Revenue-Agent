import { Connection } from "jsforce";

export function createSalesforceConnection(): Connection {
  const instanceUrl = process.env.SF_INSTANCE_URL;
  const accessToken = process.env.SF_ACCESS_TOKEN;

  if (!instanceUrl || !accessToken) {
    throw new Error(
      "SF_INSTANCE_URL and SF_ACCESS_TOKEN must be set (see .env.example). " +
        "This demo authenticates with a pre-obtained session token from a permission-set-scoped " +
        "integration user; production use should replace this with JWT Bearer or Client Credentials flow."
    );
  }

  return new Connection({ instanceUrl, accessToken });
}
