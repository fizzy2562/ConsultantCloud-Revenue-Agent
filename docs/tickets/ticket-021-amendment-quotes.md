# Ticket 021 — Amendment quotes

Status: DONE

## What this covers

The tool set could create a brand-new quote (`create_initial_quote`) or a renewal quote (`create_renewal_quote`), but had no way to create an **amendment quote** — a new Draft quote that amends an existing active quote for the same account (e.g. "add seats mid-term without waiting for renewal"), copying that quote's term length forward. This is a real functional gap the project's own spec calls out explicitly (PROJECT_SPEC.md, P1 scope: "Amendment quote"). Added `create_amendment_quote` across the full stack: schema, `RevenueGateway` interface, both gateway implementations, MCP tool registration, and the live agent's confirmation gate — following the exact existing pattern of `create_renewal_quote` at every layer.

Dispatched as two parallel, file-disjoint pieces against a contract fixed up front: **codex** built the core (schema, types, `MockRevenueGateway`, MCP tool registration, agent-runtime wiring including source-quote-number resolution, tests, docs) while **Qwen** built the isolated `SalesforceRevenueGateway.createAmendmentQuote` implementation (a single-file, mechanical addition mirroring `createRenewalQuote`'s existing structure, given the exact contract and full current file content).

Notably, `create_amendment_quote` and `submit_quote` action names already existed, unused, in `packages/policy/src/protectedMutations.ts`'s `MutationAction` union — forward-looking scaffolding from ticket-002's original policy-engine design that had never been wired to a real tool. This ticket completes exactly the gap that scaffolding anticipated; no changes to that file were needed.

## What the orchestrator fixed during merge

- Qwen's response was cut off by its output-token budget while regenerating the entire 575-line file as requested (`done_reason: length`) — but the new `createAmendmentQuote` method itself came through complete and correct before the cutoff. Rather than re-run with a larger budget, spliced that single verified method directly into the real file (added the `CreateAmendmentQuoteInput` import and the method body after `createRenewalQuote`), which is a purely mechanical integration step, not new authorship.
- `evals/cases/scenarios.ts`'s two hand-written test-double gateways (`FailingGateway`, `ReturningFailureGateway`) needed a `createAmendmentQuote` delegate stub added, matching every other non-overridden method already on those classes — same category of fix as ticket-019.
- `packages/revenue-mcp/tests/server.test.ts`'s tool-inventory assertion needed `create_amendment_quote` added — same category of fix as ticket-019.
- The REST bridge (ticket-020) and its OpenAPI spec were dispatched and built before this tool existed, so they didn't expose it. Added `CreateAmendmentQuoteInputSchema` to `apps/web/app/api/tools/[toolName]/route.ts`'s `toolSchemas` map, added the matching path and component schema to `docs/agentforce-external-service.openapi.yaml` (mirroring `add_quote_line`'s existing shape), re-validated with `swagger-cli` (passed), and updated `docs/agentforce-setup.md`'s tool-count and mutation-list mentions from eleven/six to twelve/seven. Same cross-ticket scope gap pattern as ticket-020 closing ticket-019's gap — only visible at the intersection of two tickets dispatched in parallel.

## Verification

- Full workspace `pnpm -r build`/`pnpm -r test`: 71/71 tests passing (up from 64).
- Evals: 10/11 passing, E09 still an honest skip.
- `swagger-cli validate`: passed.
- New tests cover: creating an amendment from the seeded Acme quote and copying its `termMonths` (36), `NOT_FOUND` for a missing source quote, idempotent replay, and the tool being gated behind a real confirmation round-trip in the live agent.
- Live end-to-end verification against the actual running dev server via curl, beyond the unit tests: `create_amendment_quote` without confirmation → `CONFIRMATION_REQUIRED`; with confirmation → succeeded, and a follow-up `get_quote_summary` confirmed `termMonths: 36` (copied from the source) with `lines: []`; a bogus `sourceQuoteId` → `NOT_FOUND`.

## What's left

Nothing code-side. `SalesforceRevenueGateway.createAmendmentQuote` calls a plausible Flow action name (`quotingAI__createAmendQuote`, following this file's existing `quotingAI__...` naming convention) and hasn't been tested against a real org — same caveat as every other Salesforce-gateway method in this project until ticket-018's real-gateway toggle is exercised with real credentials.
