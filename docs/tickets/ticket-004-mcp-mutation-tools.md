# Ticket 004 — Revenue MCP mutation tools (against the mock, gated by policy)

Status: DONE
Depends on: ticket-001 (contracts + mock gateway), ticket-002 (policy engine), ticket-003 (server scaffold + read tools pattern)

## Review notes

Resolved one design ambiguity ticket-002 flagged explicitly: `MockRevenueGateway` already idempotency-guards quote creation internally, so does the MCP tool layer need to *also* wrap with `packages/policy`'s `withIdempotency`? Yes — the acceptance test asserts the gateway method was called exactly once via `vi.spyOn`, which only holds if the outer (tool-layer) idempotency check short-circuits before the gateway method is invoked a second time; the gateway's own internal short-circuit still counts as an invocation to a spy. So idempotency is layered at the tool boundary for all four mutation tools, uniformly.

Qwen's generated code (tool registrations + confirmation/discount gating logic) was correct on the first attempt, including never hardcoding the 15/25 thresholds. Two real defects were in my own test brief, not Qwen's output, and were fixed directly: (1) `apply_discount` test calls omitted the required `quoteLineId` field, causing the SDK's own schema validation to reject the call before it reached our handler; (2) `server.test.ts`'s tool-list assertion predates this ticket and needed updating from 5 to all 9 tools now that mutations are registered on the same server.

Verified: `pnpm -r build` and `pnpm -r test` green across the whole workspace, 27 tests total. Mutation tests directly preview eval scenarios E01, E02, E03, E04, and E07 from PROJECT_SPEC.md Section 12.

## Goal

The four mutation tools, each of which must pass through the policy engine (ticket-002) before touching the gateway. This is where guardrails actually get enforced at the tool-call boundary, not just tested in isolation.

## Files you may create or touch

```
packages/revenue-mcp/src/tools/createInitialQuote.ts
packages/revenue-mcp/src/tools/createRenewalQuote.ts
packages/revenue-mcp/src/tools/addQuoteLine.ts
packages/revenue-mcp/src/tools/applyDiscount.ts
packages/revenue-mcp/tests/mutations.test.ts
```

Register the four new tools in `packages/revenue-mcp/src/server.ts` (touching that file to add registrations is fine; do not restructure it).

Import `packages/policy` for guardrail checks. Do not reimplement discount thresholds, protected-action rules, or idempotency logic inside these tool files — call into `packages/policy`.

## Required flow for every mutation tool

1. Validate input against the Zod schema from `packages/shared` (reject with a clear `ToolResult` error if invalid — do not let malformed input reach policy or gateway logic).
2. Ask the policy engine whether this action is protected and, if so, whether `confirmedByUser` satisfies that (ticket-002's `requireConfirmation`).
3. For `apply_discount` specifically: run `evaluateDiscount` first. If `rejected`, return a `ToolResult` with `ok: false` and a clear, non-retryable error — do not call the gateway at all. If `approval_required` and `confirmedByUser` is not true, return `ok: false` indicating approval is needed, again without calling the gateway.
4. Wrap the actual gateway call in `withIdempotency(idempotencyKey, ...)` from ticket-002's idempotency store.
5. Call the gateway method.
6. Return the gateway's `ToolResult`, or a policy-generated `ToolResult` if step 2/3 short-circuited.

## Tool metadata bar (same standard as ticket-003)

Each of these four must explicitly state in its description:
- that it mutates Salesforce (or the mock, pre-Phase-3) state
- that it requires `confirmedByUser: true` for protected cases, and what happens if that's missing (a clear rejection, not a silent no-op or a fabricated success)
- for `apply_discount`: the exact policy bands (0–15% permitted, 15.01–25% approval required, >25% rejected) so the agent's own reasoning about what to propose is grounded in the same numbers the deterministic layer enforces

## What this ticket must never do

- Never let the LLM-facing tool description or any code path treat "the model seems confident" as equivalent to confirmation — only `confirmedByUser: true` counts.
- Never call the gateway before policy evaluation completes — policy is a gate, not a post-hoc check.
- Never allow a duplicate `idempotencyKey` to reach the gateway a second time (this must produce identical output to the first call, sourced from the idempotency store, not a second mutation).
- Never fabricate a quote ID, quote number, or success result if the gateway call fails or is blocked by policy — a blocked/failed mutation must return `ok: false` with a real error code, never a made-up success payload.

## Acceptance criteria

1. `pnpm --filter revenue-mcp test` passes, covering at minimum (this directly previews eval scenarios E01–E04 and E07 from PROJECT_SPEC.md Section 12, so write these as if they were those scenarios):
   - `create_renewal_quote` with `confirmedByUser: false` on a request that policy considers protected -> `ok: false`, gateway never called (assert via spy/mock that the gateway method was not invoked).
   - `create_renewal_quote` with `confirmedByUser: true` and valid input -> `ok: true`, quote created via the mock gateway.
   - `apply_discount` at 12% -> permitted, succeeds without requiring confirmation.
   - `apply_discount` at 20% with `confirmedByUser: false` -> `ok: false`, approval-required error, gateway not called.
   - `apply_discount` at 20% with `confirmedByUser: true` -> succeeds.
   - `apply_discount` at 30% -> `ok: false`, rejected, regardless of `confirmedByUser` value — gateway never called.
   - Calling `create_renewal_quote` twice with the same `idempotencyKey` and `confirmedByUser: true` -> both calls return the same `quoteId`; the mock gateway's create method was invoked only once (assert call count, not just output equality — this is what makes the test actually prove idempotency rather than coincidental determinism).
2. No policy logic (thresholds, protected-action lists) duplicated inline in any tool file — grep for a bare number like `15` or `25` in these tool files should turn up nothing; those live only in `packages/policy`.

## Out of scope

- UI confirmation card (separate ticket) — these tools just enforce the contract; the UI is what actually shows the user something to confirm
- Real Salesforce gateway (Phase 3)
- Amendment quotes, remove/update quote line (P1 in PROJECT_SPEC.md Section 3 — not P0)
