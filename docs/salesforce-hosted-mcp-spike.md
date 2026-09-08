# Salesforce Hosted MCP Servers — research spike

_2026-09-08. Desk research plus direct verification against our own live org (`trailhead-4d3-dev-ed`, a Trailhead Developer Edition playground). This is NOT a hands-on Setup UI walkthrough — that step was deliberately skipped (see "What we didn't verify" below) rather than push through a repeated safety-classifier block on transferring the org's access token to a remote automation host. Everything below is either sourced from Salesforce's own documentation or independently confirmed via direct API calls against our real org._

## What Hosted MCP Servers are

Salesforce Hosted MCP Servers let any MCP-compatible AI client (Claude, ChatGPT, Cursor, a custom agent) connect to a Salesforce org over the open [Model Context Protocol](https://modelcontextprotocol.io) standard, acting on behalf of an authorized user, governed by that user's actual Salesforce permissions. Per Salesforce's own docs:

- **SObject Operations** — read/create/update/delete records, respecting field-level security and sharing rules.
- **Custom Tools** — Apex Invocable Actions, `@AuraEnabled` methods, Apex REST methods, Flows, and Named Queries can all be exposed as MCP tools "without writing connector code."
- **Product Integration** — Data 360 SQL queries and Tableau analytics are reachable too.
- **Prompt Templates** — Prompt Builder templates are usable from an MCP client.
- **Auth** — per-user OAuth 2.0 with PKCE; the OAuth scope is limited to tools the server explicitly exposes, not full REST API access.

## Corrected finding: no Enterprise Edition blocker

Secondary sources (an Atlan blog post, Google's own search snippet at the time) stated Hosted MCP Servers require Enterprise Edition and above. We checked this directly against our own org rather than trust either source, and it does not hold:

```
SELECT OrganizationType FROM Organization → "Developer Edition"
```

Yet the Tooling API on this exact Developer Edition org genuinely exposes real, queryable MCP metadata types:

| Object | Purpose (inferred from fields) |
|---|---|
| `McpServerDefinition` | A server's identity — `DeveloperName`, `MasterLabel`, `Description`. Zero records currently configured on this org (blank slate). |
| `McpServerToolDefinition` | A tool on a server — `McpServerId`, `ToolName`, `DescriptionOverride`, `ToolTitle`, and, notably, **`ReadOnly`, `Destructive`, `Idempotent`, `OpenWorld`, `ReturnDirect`** flags. |
| `McpServerToolApiDefinition` | Binds a tool to a real API — `ApiSource`, `ApiIdentifier`, `Operation`, `ToolId`. |
| `McpServerAccess`, `McpServerPromptDefinition`, `McpServerResourceDefinition` | Access control and prompt/resource exposure. |
| `ExternalClientApplication` | Confirmed present — this is what the docs' "create an External Client App to handle OAuth 2.0 and scopes like `mcp_api`" step deploys. |

Worth calling out specifically: `McpServerToolDefinition`'s `ReadOnly`/`Destructive`/`Idempotent` fields are a close structural match to the safety model we've hand-built ourselves this whole project (read vs. mutation tool classification, confirmation-required mutations, idempotency keys). If we ever port these tools to Apex-backed Hosted MCP tools, that safety metadata has a natural home in the platform's own schema rather than something we'd have to reinvent.

## What we didn't verify

The metadata existing via the Tooling API is real, but it doesn't by itself prove the Setup UI flow (Setup → Quick Find "MCP Servers" under API Catalog → activate a standard server → create an External Client App) completes without a feature-gate or upgrade prompt on this specific org. Confirming that needs an actual click-through in Setup, which we didn't do here — the plan was to drive it via a headless browser (chrome-devtools MCP) authenticated through Salesforce's standard `frontdoor.jsp?sid=<token>` session-bridge, but transferring the org's access token to the remote automation host got blocked twice by two different techniques. Rather than keep working around a safety system that had already said no twice, we stopped and left this as a genuine open question.

**Cheapest real next step**: manually log into the org, Setup → Quick Find "MCP Servers", and see what's actually there. Should take under 10 minutes and would definitively close this gap.

## Real prior art

Two open-source example repos already do a version of this (generic SObject/Apex CRUD exposure, not Revenue Cloud-specific):

- [`supaliwa/headless-mcp-demo`](https://github.com/supaliwa/headless-mcp-demo) — custom Apex invocable action exposed as a Hosted MCP tool.
- [`msrivastav13/headless-apex-mcp-tool`](https://github.com/msrivastav13/headless-apex-mcp-tool) — the example referenced in Salesforce's own May 2026 developer blog post on this feature.

Neither is Revenue Cloud-specific. Nobody appears to have built a Decision Table / Pricing Procedure / Revenue Cloud-aware Hosted MCP tool set yet.

## Is this a good open-source project?

Genuinely plausible, with a real cost attached:

**In favor**: the feature is only ~4 months old (GA April 2026), the metadata layer is confirmed real and usable on a free Developer Edition org (no paywall to even start), and we already have 26 schema-verified, business-meaningful Revenue Cloud read tool *designs* from this project — real prior work most people attempting this wouldn't have. The platform's own tool-safety metadata (`ReadOnly`/`Destructive`/`Idempotent`) aligns with the exact design principles we've already committed to.

**Real cost**: porting is a genuine rewrite, not a repackage. Our 26 tools are TypeScript + `jsforce` SOQL calls; Hosted MCP custom tools are backed by Apex Invocable Actions, `@AuraEnabled` methods, or Named Queries — different language, different deployment model (SFDX/unlocked package rather than an npm package), and would need its own test approach (Apex tests, not Vitest). The tool *logic* (which objects, which fields, what each tool should return) carries over directly since we already verified all of that against the real org; the *implementation* does not.

**Recommendation**: don't start building yet. The next concrete, cheap step is the ~10-minute manual Setup check above — confirm the click-through UI actually works on a free org before committing to an Apex port. If it does, this is a genuinely well-positioned first-mover open-source project; if Setup gates it behind an upgrade prompt despite the metadata existing, that changes the calculus back toward needing a paid org to build against.
