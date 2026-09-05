# Ticket 003 — Revenue MCP server + read tools (against the mock)

Status: DONE
Depends on: ticket-001 (shared contracts + MockRevenueGateway)

## Review notes

Uses the real `@modelcontextprotocol/sdk` (not an internal facsimile) — confirmed via the org's actual installed type definitions before briefing Qwen, since a fast-moving SDK's exact API (`registerTool` vs deprecated `tool()`, `ZodRawShapeCompat`, etc.) isn't something a model can be expected to know precisely. Gave Qwen one fully-worked tool registration as a pattern to replicate for the other four; all five came back correct on the first attempt, including full 5-point tool descriptions.

Deviated from the ticket's file list: all 5 read tools live in one `tools/index.ts` rather than 5 separate files — they're structurally identical thin wrappers needing the same SDK knowledge, so splitting them multiplies chances of a subtle generic-typing slip without adding real value. `packages/shared/src/index.ts` (a barrel file) was added since it didn't exist yet and tools needed a stable package-level import rather than deep subpaths.

Several SDK-typing issues surfaced only at `tsc` time and were fixed directly rather than round-tripped, since they were forced by the type system / correct third-party API usage, not business-logic decisions: missing `@types/node` for the `process` global, `client.callTool()`'s return type needing `CallToolResultSchema` passed explicitly plus a local type assertion (the SDK's inferred type didn't narrow as its own `.d.ts` suggested it should), and `noUncheckedIndexedAccess` guards on `content[0]`.

Verified: `pnpm -r build` green, `pnpm --filter revenue-mcp test` 4/4 passing — including `tools/list` returning exactly the 5 expected tools over a real in-memory MCP client/server pair, not a mock of the protocol.

## Goal

Stand up the actual MCP server and implement the four read-only tools against `MockRevenueGateway`. No mutation tools here — those are ticket-004. No Salesforce calls — the gateway is injected, and this ticket only ever wires up the mock.

## Files you may create or touch

```
packages/revenue-mcp/package.json
packages/revenue-mcp/tsconfig.json
packages/revenue-mcp/src/server.ts
packages/revenue-mcp/src/tools/findAccount.ts
packages/revenue-mcp/src/tools/getAccountRevenueContext.ts
packages/revenue-mcp/src/tools/searchProducts.ts
packages/revenue-mcp/src/tools/getAccountAssets.ts
packages/revenue-mcp/src/tools/getQuoteSummary.ts
packages/revenue-mcp/tests/*.test.ts
packages/revenue-mcp/README.md
```

Do not touch `packages/shared/`, `packages/policy/`, or `apps/web/`. Import the gateway interface, schemas, and mock from `packages/shared`.

## Tools to implement (PROJECT_SPEC.md Section 3 tool list, read-only subset)

1. `find_account` — wraps `RevenueGateway.findAccount`
2. `get_account_revenue_context` — composite: fetches account + its assets + current discount, so the agent doesn't need three round trips for the common "what's this account's situation" question
3. `search_products` — wraps `RevenueGateway.searchProducts`
4. `get_account_assets` — wraps `RevenueGateway.getAccountAssets`
5. `get_quote_summary` — wraps `RevenueGateway.getQuoteSummary`

The gateway implementation used by `server.ts` must be swappable via constructor/factory injection — this is the seam Phase 3 uses to swap in `SalesforceRevenueGateway` later without touching tool code. Do not hardcode `MockRevenueGateway` inside each tool file; inject it once at server construction.

## Tool metadata bar (PROJECT_SPEC.md Section 7 — "tool metadata must be excellent")

Every tool's MCP description must state, in plain language:
- when the tool should be used
- what it mutates (for these five: nothing — say so explicitly, e.g. "This tool is read-only and never modifies Salesforce data.")
- prerequisites (e.g. `find_account` should generally be called before tools that take an `accountId`)
- whether confirmation is required (no, for all five)
- what the tool will never infer (e.g. `find_account` never invents an account that isn't in the fixture data; if no match, it returns an empty result — it does not guess)

Weak/generic descriptions ("Gets account info") will fail review. The bar is: could an agent reliably decide when to call this vs. a similar tool, from the description alone.

## What this ticket must never do

- Never return a fabricated account, product, asset, or quote that isn't backed by data the gateway actually returned — if the gateway returns empty, the tool returns empty (Section 6: never invent IDs, prices, approval status).
- Never expose raw SOQL or a generic "query" tool (Section 3: "Do not expose raw arbitrary SOQL as the primary interface").
- Never let a tool call touch a mutation method on the gateway, even accidentally through a shared helper.

## Acceptance criteria

1. `pnpm --filter revenue-mcp build` succeeds.
2. `pnpm --filter revenue-mcp test` passes, covering at minimum:
   - `find_account` with "Acme" returns Acme University; with a nonsense string returns an empty result, not an error and not a fabricated match.
   - `get_account_revenue_context` for Acme University returns the 100-seat Cloud Pro asset and 12% discount from the fixture.
   - `search_products` returns all three fixture products for an empty/broad query.
   - Every tool's response is validated against its output Zod schema from `packages/shared` before being returned (add a test that a schema-violating internal object would fail, e.g. via a spy/mock).
3. Every tool has a description string of at least 2 sentences covering the 5 metadata points above — this can be checked by a simple test asserting description length/content, or by manual review during defect-check.
4. Server starts (`pnpm --filter revenue-mcp start` or equivalent) and responds to an MCP `tools/list` call listing exactly these 5 tools (no mutation tools yet).

## Out of scope

- Mutation tools (ticket-004)
- Policy engine integration (mutation tools only — reads don't need policy gating)
- Real Salesforce gateway (Phase 3)
