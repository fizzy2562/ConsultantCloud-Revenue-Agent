# Ticket 020 — Agentforce REST bridge

Status: DONE

## What this covers

The eleven revenue tools only existed inside this app's own MCP server and in-process agent runtime — nothing outside the app could call them. Real Salesforce Agentforce Studio agents integrate over HTTP via an External Service backed by an OpenAPI document, not MCP. Added a stateless REST bridge that exposes every MCP tool as `POST /api/tools/[toolName]`, backed by:

- `apps/web/app/api/tools/[toolName]/route.ts` — a dynamic Next.js route. Each request spins up a fresh in-process MCP server/client pair over `InMemoryTransport` (the same pattern already used by `agent-runtime` and the server's own tests), validates the body against the tool's real Zod input schema, calls the tool, and returns its JSON result verbatim.
- `apps/web/lib/toolsBridgeAuth.ts` — `authorizeToolsRequest()`, a fail-closed bearer-token check against `TOOLS_API_KEY`. Missing/empty env var → 500 (never silently open); missing/wrong bearer token → 401.
- `docs/agentforce-external-service.openapi.yaml` — an OpenAPI 3.0.3 document describing all eleven operations, validated with `swagger-cli`, ready to hand to Salesforce's External Service import wizard.
- `docs/agentforce-setup.md` — step-by-step admin instructions: deploy, generate and set `TOOLS_API_KEY`, create the Named Credential/External Credential with the bearer header, register the External Service from the OpenAPI file, add actions to an Agentforce topic, and the exact confirmation-instruction wording a topic needs since Agentforce's planner has no built-in awareness of this project's `confirmedByUser`/`idempotencyKey` semantics.
- `apps/web/tests/toolsBridge.test.ts` — 4 tests: no-auth → 401, wrong-token → 401, a real authenticated `find_account` call → 200 with correct data, and an invalid body → 400 with field-level details.

Dispatched to **codex** in parallel with tickets 018 and 019, scoped to a disjoint file set (new route, new lib file, new docs, new test).

## What the orchestrator fixed during merge

- The route was dispatched and built before ticket-019's `remove_quote_line`/`update_quote_line` tools existed, so it only exposed the original nine tools. Added `RemoveQuoteLineInputSchema`/`UpdateQuoteLineInputSchema` imports and their two `toolSchemas` entries to `route.ts`, added the two matching paths and component schemas to the OpenAPI YAML (mirroring `add_quote_line`'s existing shape exactly), re-validated the spec with `swagger-cli` (passed), and updated `agentforce-setup.md`'s tool-count and mutation-list mentions from nine/four to eleven/six. This gap only existed at the intersection of two tickets dispatched in parallel — neither ticket's own scope could have caught it alone.
- The route originally constructed a hardcoded `new MockRevenueGateway()`. Switched it to `createRevenueGateway()` (ticket-018) so the REST bridge honors the same real-vs-mock toggle as the chat UI instead of silently diverging from it.
- Reconciled `apps/web/package.json` and `.env.example`, both touched by more than one parallel ticket (`@consultantcloud/revenue-mcp` + `@modelcontextprotocol/sdk` dependencies; `SF_INSTANCE_URL`/`SF_ACCESS_TOKEN` + `TOOLS_API_KEY` env docs) — straightforward additive merges, no conflicting edits.

## Verification

- Full workspace `pnpm -r build`/`pnpm -r test`: 64/64 tests passing (up from 60), including the bridge's own 4 new tests.
- `swagger-cli validate docs/agentforce-external-service.openapi.yaml`: passed, after adding the two ticket-019 operations.
- Live end-to-end verification against the actual running dev server (`TOOLS_API_KEY` set), via curl, beyond what the unit tests cover:
  - No `Authorization` header → 401.
  - Wrong bearer token → 401.
  - Valid `find_account` call → 200 with real seeded Acme University data (`existingDiscountPercent: 12`).
  - Malformed body → 400 with field-level validation errors.
  - `remove_quote_line` and `update_quote_line` called **without** `confirmedByUser` → both correctly blocked with `CONFIRMATION_REQUIRED`, proving the ticket-019 `MutationAction` fix is wired through the bridge, not just the in-process agent runtime.
  - `update_quote_line` **with** confirmation (quantity 150) → succeeded; follow-up `get_quote_summary` showed `quantity: 150, netPrice: 316800`, confirming correct recomputation with `discountPercent` preserved.
  - `remove_quote_line` **with** confirmation → succeeded; follow-up `get_quote_summary` showed `lines: []`.
  - Dev server was killed afterward specifically to reset the mock gateway's mutated in-memory state back to its clean seeded default.

## What's left

Nothing code-side. The bridge has not been exercised against a real Salesforce org's Named Credential/External Service (that requires an actual Salesforce sandbox and is outside this repo's scope, same caveat as every other Salesforce-integration piece in this project). `docs/agentforce-setup.md` documents the exact steps for whoever does that next.
