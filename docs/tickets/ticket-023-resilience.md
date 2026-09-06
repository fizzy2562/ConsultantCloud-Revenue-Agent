# Ticket 023 — Retry and circuit-breaker handling

Status: DONE

## What this covers

`SalesforceRevenueGateway`'s methods each had a top-level try/catch that turned any thrown error into a `SALESFORCE_ERROR` result, but there was no actual retry logic — a single transient network blip or rate-limit response failed the whole operation immediately — and no protection against repeatedly hammering a genuinely down or rate-limited org with slow-to-fail requests. This is a real production-readiness gap the project's own spec calls out explicitly (PROJECT_SPEC.md, P1 scope: "Retry / circuit-breaker handling").

Added two generic, reusable resilience primitives to `packages/policy` — `withRetry` (exponential backoff, 3 attempts by default) and `CircuitBreaker` (opens after 3 consecutive failures, 30s cooldown, then allows a half-open trial call) — and wired both into the single shared `invokeFlowAction` helper inside `salesforceGateway.ts`. Six of that file's twelve methods (`getAccountAssets`, `createInitialQuote`, `createRenewalQuote`, `createAmendmentQuote`, `addQuoteLine`, `applyDiscount`) route their Salesforce network calls through that one function, so wrapping it there gives all six real resilience with a single, minimal, low-risk change — no call sites needed to change, since every caller's existing try/catch already correctly handles whatever the wrapped function throws (including a `CircuitOpenError` from an open breaker).

The other six methods (`findAccount`, `getAccountById`, `searchProducts`, `removeQuoteLine`, `updateQuoteLine`, `getQuoteSummary`) call `this.conn.query(...)`/`this.conn.sobject(...)` directly rather than through `invokeFlowAction`, and were deliberately scoped out of this ticket rather than left as an accidental gap — documented plainly in both the ticket brief and `docs/tool-contracts.md`.

Dispatched as a single ticket to **codex**, since it's a self-contained new module plus one internal change to an existing shared function — not the kind of isolated single-file split that made a parallel Qwen dispatch useful for tickets 019/021.

## What the orchestrator fixed during merge

Nothing — the diff matched the ticket's spec exactly on the first pass: `withRetry`/`CircuitBreaker`/`CircuitOpenError` in a new `packages/policy/src/resilience.ts`, re-exported from that package's barrel file, `invokeFlowAction` wrapped with a module-level breaker instance, and the documented scope boundary in `docs/tool-contracts.md`. Build and tests passed immediately on merge with no gaps to close.

## Verification

- Full workspace `pnpm -r build`/`pnpm -r test`: 77/77 tests passing (up from 71), including 6 new resilience tests covering retry success/exhaustion and circuit-breaker reset/open/cooldown behavior (the cooldown test uses `vi.useFakeTimers()` rather than a real wait, avoiding flakiness).
- Evals: 10/11 passing, E09 still an honest skip — no regressions.

## What's left

Nothing code-side for the scope as defined. The six direct-SOQL/`sobject()` methods remain without retry/circuit-breaker coverage — a deliberate scope boundary, not an oversight, and a natural candidate for a future ticket if warranted. As with every other `SalesforceRevenueGateway` method, none of this has been exercised against a real org; the resilience primitives themselves are directly unit-tested and don't depend on Salesforce at all.
