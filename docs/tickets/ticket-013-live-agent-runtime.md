# Ticket 013 — Live agent runtime (real reasoning, not scripted playback)

Status: DONE (core loop); one refinement round in progress (see below)

## Why this exists

Every review of this project (ticket-011, ticket-012) correctly pointed out the same structural gap: the MCP tool layer was real and tested, but nothing in `apps/web` actually called it. The four "conversation flows" were 100% hardcoded scripts replayed on button click — no reasoning, no live tool calls, no real agent. This ticket builds and wires in the missing piece.

## What was built

- **`packages/agent-runtime`** (new package, built by codex `gpt-5.6-sol`): connects to the real MCP server (`createServer` from `@consultantcloud/revenue-mcp`) via an in-process `Client`/`InMemoryTransport` pair — the same pattern already proven in `packages/revenue-mcp/tests/server.test.ts`. It discovers the real tool schemas via `client.listTools()` (no hardcoded tool list), converts them to Ollama's tool-calling format, and runs an iterative reasoning loop against `qwen3.8:27b`.
- **The confirmation gate is structural, not model-trusted.** Every prior review flagged `confirmedByUser: true` as a boolean the model could set on itself. `runAgentTurn` never executes a mutation tool (`create_initial_quote`, `create_renewal_quote`, `add_quote_line`, `apply_discount`) directly from a model tool call — it intercepts it, builds a `PendingConfirmation`, and returns. The mutation only actually runs on an explicit, separate `{ kind: "confirm" }` call from the caller, at which point the runtime itself sets `confirmedByUser: true` and a fresh `idempotencyKey`, discarding whatever the model may have put in those fields. Covered by a dedicated test proving the model-supplied idempotency key is never the one actually used.
- **`apps/web/app/api/chat/route.ts`** (new, built by Qwen 3.8): a Next.js route handler wiring a singleton `MockRevenueGateway` to `runAgentTurn`.
- **`apps/web/components/ChatApp.tsx`** (rewritten by Qwen 3.8): replaced all scripted flow logic with real `fetch("/api/chat")` calls, a running cumulative trace, loading states, and the same confirm/cancel UI wired to real backend round-trips instead of local state mutation.

## What the orchestrator fixed during integration

- **Turbopack couldn't resolve these packages' internal relative imports.** Every workspace package (`shared`, `telemetry`, `policy`, `revenue-mcp`) uses `moduleResolution: "Bundler"`-style relative imports written with a `.js` suffix (e.g. `export * from "./logger.js"`) pointing at `.ts` files — valid and already working under `tsc`/vitest, but Turbopack (unlike webpack/vite) doesn't perform the `.js`→`.ts` remap when bundling a dependency's source directly. Fixed by dropping the unnecessary `.js` extensions (Bundler mode doesn't require them) across the 8 affected files. Also added `transpilePackages` to `next.config.mjs` (the standard Next.js mechanism for consuming un-prebuilt monorepo TS packages), though this alone did not fix the deeper resolver issue above.
- Two small type-narrowing casts forced by the type system: the API route's `RunAgentTurnInput` cast (the runtime `kind` check doesn't structurally narrow to the full discriminated union) and an explicit `ChatTurn[]` annotation in `ChatApp.tsx` (an inline array-literal spread was widening `role` from its literal union to `string`).
- **A real product gap found only by testing live, not by inspection**: `get_account_assets` had no way to tell the model which quote/line an existing asset lives on, so the discount starter prompts had no real quoteId/quoteLineId to act on — the live model correctly refused to fabricate one rather than guessing, exactly as designed, but that meant 2 of the 4 demo prompts had nothing real to work with. Fixed: `AccountAsset` gained nullable `quoteId`/`quoteLineId` fields; `MockRevenueGateway` now seeds an existing quote/line for Acme University in its constructor (matching the fixture's existing `existingDiscountPercent: 12`, which was previously only account-level metadata with no backing quote record) and resolves the linkage in `getAccountAssets`; `SalesforceRevenueGateway` returns `null` for both (honest gap — needs a follow-up SOQL join against `QuoteLineItem`, not fabricated).
- Rewrote `apps/web/tests/ChatApp.test.tsx` for the new async, fetch-driven component (the old tests asserted on synchronous scripted state that no longer exists).

## Verified live, not just by test

All four starter prompts were driven through a real browser against the real dev server and the real Ollama-hosted `qwen3.8:27b` (via an SSH tunnel to the model host):
- Renewal: real `find_account` → `get_account_assets` → `search_products` → `get_account_revenue_context` reads, a real confirmation card, and a real `create_renewal_quote` write on confirm (Quote Q-10452-style real ID).
- 20% discount: real reads including `get_quote_summary` resolving the seeded quote, correct confirmation card, real `apply_discount` write on confirm.
- Greenfield initial quote: real reads, real `create_initial_quote` write on confirm.
- 30% discount: correctly reasons about the lack of a real quote before the account-asset linkage fix landed — confirms the model does not fabricate identifiers it doesn't have.

## Known remaining gaps (being addressed in a follow-up round)

- Confirmation cards display raw Salesforce-style IDs (e.g. `a0Q000000000001AAA`) instead of resolved quote numbers for `add_quote_line`/`apply_discount`.
- A compound request ("renew AND increase seats") only executes the first mutation per confirmation; the loop currently stops entirely after any mutation gate rather than checking for a natural next step after a confirm. A refinement dispatched to codex addresses both by adding a `quoteNumbers` resolution map (mirroring the existing `accountNames` pattern) and continuing the reasoning loop after a confirmed mutation, still gated behind a fresh, separate confirmation for any further mutation.
- `getQuoteSummary()`'s line-item fallbacks and the `ToolResultSchema` discriminated-union gap from ticket-012 remain open, unrelated to this ticket's scope.
