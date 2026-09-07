# Connect the revenue tools to Salesforce Agentforce

This guide connects a Salesforce Agentforce agent to the twelve stateless revenue actions exposed by this app. Agentforce owns the conversation and planning; the app only validates and executes individual tool calls.

## 1. Deploy the app

Deploy the ConsultantCloud web app to hosting that Salesforce can reach over a public HTTPS URL. Localhost and private network URLs will not work unless you separately provide a secure, publicly reachable tunnel or network connection. Hosting and Salesforce org deployment are outside this repository's scope.

Verify the deployed URL serves the bridge at `/api/tools`. For example, a request to `/api/tools/find_account` without credentials should return HTTP 401 after the API key is configured.

## 2. Configure the scoped shared secrets

Generate a high-entropy secret with a password manager or a platform secret generator. For example, on a machine with OpenSSL:

```shell
openssl rand -base64 48
```

Set the generated value as the deployed app's `TOOLS_API_KEY` environment variable and restart or redeploy the app. Store it only in the hosting platform's secret manager and Salesforce; do not commit it. If this variable is absent or empty, the bridge deliberately refuses every request with HTTP 500.

`TOOLS_API_KEY` continues to authorize the twelve revenue lookup and quote-management actions documented here. If a separate Agentforce integration needs catalog and bundle-management actions, generate a different secret and configure it as `CATALOG_TOOLS_API_KEY`. Catalog endpoints fail closed when that variable is unset, and neither key authorizes the other scope. Use a separate External/Named Credential carrying `Bearer <CATALOG_TOOLS_API_KEY>` for those actions.

## 3. Create the Salesforce Named Credential

Salesforce Setup labels and screens can vary slightly by release and credential model.

1. In **Setup**, open **Named Credentials** and create an External Credential for a custom/header-based authentication configuration.
2. Configure a principal permitted for the users who will run the Agentforce actions.
3. Add an authentication header named `Authorization` whose value is `Bearer <TOOLS_API_KEY>`, replacing the placeholder with the exact deployed secret. Mark the value as protected/secret where the UI offers that choice.
4. Create a Named Credential for the app's public HTTPS endpoint. The bridge base is `https://your-host.example/api/tools`. Because the supplied OpenAPI document includes `/api/tools` in each operation path, use the host origin (`https://your-host.example`) as the Named Credential URL if Salesforce appends OpenAPI paths to this field; the resulting action URL must contain `/api/tools` exactly once.
5. Associate the External Credential with the Named Credential, enable callouts, and grant the principal access through the appropriate permission set.

## 4. Register the External Service

1. In **Setup**, open **External Services** and choose **New External Service**.
2. Select the Named Credential created above.
3. Upload or paste [`agentforce-external-service.openapi.yaml`](./agentforce-external-service.openapi.yaml). Before importing, replace the example server URL if your Salesforce wizard uses the `servers` entry; the Named Credential remains the source of authentication.
4. Name the service, for example `ConsultantCloudRevenueTools`, and complete registration.
5. Confirm Salesforce discovered all twelve operations: `find_account`, `get_account_revenue_context`, `search_products`, `get_account_assets`, `get_quote_summary`, `create_initial_quote`, `create_renewal_quote`, `create_amendment_quote`, `add_quote_line`, `remove_quote_line`, `update_quote_line`, and `apply_discount`.
6. Use the External Services test capability, if available, to call `find_account` with `{ "name": "Acme" }`. A valid request returns HTTP 200; inspect the payload's `ok` field for tool-level success or failure.

## 5. Add actions to an Agentforce agent

1. Open **Agentforce Studio** in Setup and create an agent, or edit the intended existing agent.
2. Add a topic such as **Revenue quotes and renewals**. Describe when the agent should look up accounts, inspect assets and quotes, search products, and create or modify quotes.
3. Add actions backed by each desired operation from `ConsultantCloudRevenueTools`. Give each action clear instructions and expose the operation's required inputs to the planner.
4. Instruct the topic to resolve names through `find_account` and products through `search_products` instead of inventing IDs. Instruct it to inspect relevant account or quote context before proposing a mutation.
5. Activate and test the agent in a sandbox before production use. Verify read calls, denied authentication, malformed inputs, user-declined changes, idempotent retries, and discount-policy outcomes.

## Required confirmation instructions for mutations

The seven mutation actions—`create_initial_quote`, `create_renewal_quote`, `create_amendment_quote`, `add_quote_line`, `remove_quote_line`, `update_quote_line`, and `apply_discount`—require `confirmedByUser: true` in the request body to execute. This bridge does not add or infer a separate confirmation mechanism, and Salesforce's planner has no built-in awareness of this project's confirmation semantics.

Add explicit instructions like these to the Agentforce topic:

> Before invoking create_initial_quote, create_renewal_quote, create_amendment_quote, add_quote_line, remove_quote_line, update_quote_line, or apply_discount, present the exact proposed change and ask the user for explicit confirmation. Invoke the action with confirmedByUser set to true only after the user confirms. If the user declines or has not answered, do not invoke the mutation action. Generate and retain a unique idempotencyKey for the logical operation and reuse that key only when retrying the same operation.

For discounts above 15%, the current policy also requires `approvedBy` to contain a manager's name; discounts above 25% are rejected. Confirmation does not bypass those policy rules.
