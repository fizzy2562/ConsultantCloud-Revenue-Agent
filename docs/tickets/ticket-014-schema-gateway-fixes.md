# Ticket 014 — Schema and gateway-contract fixes (batch 1 of 2)

Status: DONE

## What this covers

Three real, previously-documented gaps, fixed together since they all touch the same core files (`packages/shared/schemas/index.ts`, `packages/revenue-mcp/src/tools/index.ts`) and running them as separate parallel dispatches risked conflicting edits. Dispatched as one codex (`gpt-5.6-sol`) ticket.

1. **`ToolResultSchema` is now a real Zod discriminated union** (`z.discriminatedUnion("ok", [...])`), backed by new named `ToolResultErrorSchema`/`ToolResultMetaSchema`. Previously it allowed `ok: true` with no `data` or `ok: false` with no `error` — validation existed but didn't enforce the contract every real caller already followed. Deferred in ticket-012 as "touches too many inferred types to fix blind"; verified safe via full `pnpm -r build` this time, no fallout — every gateway method already constructed literal objects matching exactly one arm of the union.

2. **`get_quote_summary` can now be called by `quoteNumber` as well as `quoteId`.** `QuoteIdInputSchema` gained an optional `quoteNumber` field alongside the existing optional `quoteId` (both optional, no `.refine()`, to keep `.shape` usable by `registerTool`); at least one is required at the gateway level, returning `INVALID_INPUT` otherwise. This closes a real gap found in ticket-013's live testing: once a quote is only known by its display number in conversation, there was previously no way to look it up again. Both gateways implement the dual lookup; the Salesforce gateway's follow-up `QuoteLineItem` query correctly uses the *resolved* `quote.Id` rather than `input.quoteId` (which can be undefined when looked up by number) — caught and fixed correctly by the agent without being explicitly told to.

3. **`get_account_revenue_context` now actually returns commercial context.** Added `RevenueGateway.getAccountById` (optional on the interface, to stay source-compatible with minimal test-double gateways in `evals/cases/scenarios.ts` that were out of this ticket's scope; both real implementations provide it). The tool now returns `{ account, assets }` instead of just `{ assets }` — `account.existingDiscountPercent` is real in the mock (the seeded 12% for Acme University) and honestly `null` in the Salesforce gateway (no real field mapped yet, same pattern as `findAccount`).

## Verification

- Full workspace `pnpm -r build` and `pnpm -r test`: 46/46 tests passing (up from 42).
- Evals: 10/11 passing, E09 still an honest skip.
- New tests: `ToolResultSchema` rejects malformed success/failure shapes; `MockRevenueGateway.getQuoteSummary` resolves by `quoteNumber` alone; `get_account_revenue_context` end-to-end test confirms the real seeded discount (12%) comes through via the live MCP server.

## What's left (batch 2, ticket 015)

- `runId` is still a fresh UUID per tool call, not per-conversation.
- `confirmedByUser` is still a bare boolean for the manager-approval discount band — no record of who actually approved it.

Both require touching `packages/revenue-mcp/src/server.ts`, `tools/mutations.ts`, `packages/agent-runtime`, and `apps/web` — overlapping files, so batch 2 is dispatched sequentially after this batch, not in parallel with it.
