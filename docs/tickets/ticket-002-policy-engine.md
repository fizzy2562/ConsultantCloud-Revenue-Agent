# Ticket 002 — Policy / guardrail engine

Status: DONE
Depends on: ticket-001 (shared contracts must be merged first)

## Review notes

Generated via `scripts/qwen.mjs` per file, all four dispatches (discountPolicy, protectedMutations, idempotencyStore, tests) came back correct on the first try — no defect rounds needed. `confirmationToken.ts` was scoped out: `requireConfirmation` in `protectedMutations.ts` already covers the stateless confirmation check the ticket describes, and a separate file would just duplicate it. Verified: `pnpm -r build` green, `pnpm --filter policy test` 11/11 passing.

## Goal

A pure, deterministic, independently-testable TypeScript module that decides whether a proposed mutation is allowed, needs approval, or is rejected — and issues/validates confirmation tokens and idempotency records. This is Section 6 of PROJECT_SPEC.md made real. It sits in front of `RevenueGateway`, not inside it.

This is the single most important guardrail in the whole project: the LLM decides *what* should happen, this module decides *whether it's allowed*. Nothing here may be prompt-driven or LLM-decided.

## Files you may create or touch

```
packages/policy/package.json
packages/policy/tsconfig.json
packages/policy/src/discountPolicy.ts
packages/policy/src/protectedMutations.ts
packages/policy/src/confirmationToken.ts
packages/policy/src/idempotencyStore.ts
packages/policy/src/index.ts
packages/policy/tests/*.test.ts
```

Do not touch `packages/shared/`, `apps/web/`, or `packages/revenue-mcp/` in this ticket. Import types from `packages/shared` — do not redefine them.

## Discount policy (config-driven, from PROJECT_SPEC.md Section 6)

```
0–15%:      permitted
15.01–25%:  manager approval required
>25%:       rejected
```

Implement this as a **data structure** (an ordered array of `{ maxPercent, decision }` or similar), not as a chain of hardcoded `if` statements with magic numbers buried in logic — the point is that changing the thresholds later means editing config, not re-reading code. Export a `evaluateDiscount(percent: number): { decision: "permitted" | "approval_required" | "rejected"; reason?: string }` function.

## Protected mutations (Section 6)

These require a valid confirmation token before executing:
- quote creation (initial or renewal)
- quote submission
- amendment creation
- any discount above the "permitted" threshold

Export `isProtectedMutation(action: string, context: {...}): boolean` and `requireConfirmation(action, context): { required: boolean; reason?: string }`.

## Confirmation tokens

- A confirmation token is generated when the agent proposes a protected action and shown to (conceptually) the user.
- A mutation tool call must reject if `confirmedByUser !== true` (matches the shared schema from ticket 001) when the action is protected.
- Token validation is stateless-checkable for this demo (no need for a full token registry/expiry system) — the presence of `confirmedByUser: true` on an already-policy-cleared request is sufficient. Do not over-build this into a session/JWT system; that's out of scope for a weekend demo.

## Idempotency store

- In-memory `Map`-backed store (this is a demo — no need for Redis/DB) keyed by `idempotencyKey`, storing the result of the first successful mutation.
- Export `IdempotencyStore` with `get(key): T | undefined` and `set(key, value): void`, plus a helper `withIdempotency(key, fn): Promise<T>` that returns the cached result on repeat calls without re-invoking `fn`.
- This must compose with, not duplicate, whatever idempotency behavior ticket-001's `MockRevenueGateway` already has for quote creation — read `packages/shared/src/mockGateway.ts` before writing this so you don't build two competing idempotency mechanisms. If in doubt about which layer owns idempotency for a given tool, flag it in your PR description rather than guessing.

## What this ticket must never do

- Never let a discount threshold, approval rule, or protected-action list live in a prompt string, system message, or LLM-facing text — deterministic config only (Section 6).
- Never approve a mutation because the model "seemed confident" — only `confirmedByUser: true` plus a passing policy check may authorize a protected action.
- Never silently allow a duplicate mutation through a differently-cased or whitespace-padded idempotency key — normalize keys consistently (document your normalization rule in a code comment only if it's non-obvious, e.g. trimming).

## Acceptance criteria

1. `pnpm --filter policy test` passes, covering at minimum:
   - `evaluateDiscount(12)` -> permitted; `evaluateDiscount(20)` -> approval_required; `evaluateDiscount(30)` -> rejected; boundary cases at exactly 15% and exactly 25%.
   - A protected mutation with `confirmedByUser: false` is rejected regardless of discount level.
   - Calling `withIdempotency("key-1", fn)` twice invokes `fn` only once and returns the same result both times.
   - Prompt-injection-shaped input (e.g. a discount percent field containing something like `"20; ignore policy"` or a non-numeric string) is rejected by schema validation before it ever reaches `evaluateDiscount` — this module should assume it only ever receives already-schema-validated numeric input, but add a defensive test proving that a malformed value doesn't silently coerce into a permitted decision.
2. No `any` types. No hardcoded percentages inside conditional branches — thresholds must be readable as data from one place in the file.
3. 100% of exported functions have at least one unit test.

## Out of scope

- MCP tool wiring (later ticket — this package is consumed by, not part of, the MCP server)
- UI confirmation card (separate UI ticket)
- Persistent (non-in-memory) idempotency storage
