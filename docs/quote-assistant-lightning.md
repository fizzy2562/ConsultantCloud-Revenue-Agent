# Quote Assistant on a Lightning page

The `quoteAssistantChat` component chats with the published **Quote Assistant** agent through the
Agent API (`api.salesforce.com/einstein/ai-agent/v1`). On a Quote record page it tells the agent which
quote is open, so "what's on this quote?" works without a number.

Deployed already: `QuoteAssistantChatController` (+ tests) and the `quoteAssistantChat` component.
It stays inert until the credential below exists: until then it shows
"Could not reach the Agent API…" in the card.

## One-time credential setup (Setup UI, ~10 minutes)

The Agent API only accepts a JWT-based token from an app with the `chatbot_api` and `sfap_api` scopes.

1. **External Client App** — Setup → External Client App Manager → New External Client App
   - Name `CC Quote Assistant API`, distribution *Local*.
   - Enable OAuth. Callback URL `https://login.salesforce.com/services/oauth2/success`.
   - Scopes: *Manage user data via APIs (api)*, *Perform requests at any time (refresh_token, offline_access)*,
     *Access chatbot services (chatbot_api)*, *Access the Salesforce API Platform (sfap_api)*.
   - Flow enablement: *Enable Client Credentials Flow*. Security: *Issue JSON Web Token (JWT)-based access
     tokens for named users*.
   - Create, then **Policies → Edit**: enable Client Credentials Flow and set **Run As** to the user the
     API calls authenticate as. For anything beyond a demo, use a dedicated integration user, not an admin.
   - **Settings → OAuth Settings → Consumer Key and Secret**: keep this tab open for step 2.
2. **External Credential** — Setup → Named Credentials → External Credentials → New
   - Label `Quote Assistant Agent API`, authentication protocol *OAuth 2.0*,
     flow *Client Credentials with Client Secret Flow*,
     identity provider URL `https://trailhead-4d3-dev-ed.develop.my.salesforce.com/services/oauth2/token`.
   - Add a **Named Principal** and paste the consumer key and secret.
3. **Named Credential** — Named Credentials → New
   - Label `Quote Assistant Agent API`, **Name `Quote_Assistant_Agent_API`** (the controller uses this),
     URL `https://api.salesforce.com`, the external credential from step 2, *Generate Authorization Header* on.
4. **Principal access** — in a permission set held by the people using the chat, under
   *External Credential Principal Access*, add the principal from step 2. Also grant Apex class access to
   `QuoteAssistantChatController` if they aren't admins.
5. **Connect the app to the agent** — Agentforce Builder → Quote Assistant → *Connections* → add an **API**
   connection and select `CC Quote Assistant API` (the Agent API's documented setup requires it).

## Put it on the page

Open any quote → ⚙ → **Edit Page** → drag **Quote Assistant Chat** onto the layout → Save → Activate.
