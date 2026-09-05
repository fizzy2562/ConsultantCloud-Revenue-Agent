# Ticket 009 — Red team pass (Phase 6)

Status: DONE — no critical findings

Per PROJECT_SPEC.md's "Agent J" role: issue-list-only, no feature building. This was run directly by the orchestrator (not dispatched to Qwen) — it's an audit task, not code authorship, and probing live behavior is something only a session with execution access can do.

## Scope

Six adversarial probe categories run against the real MCP server (not the mock LLM — no live agent exists yet, so this tests the deterministic tool/policy/schema layer directly, the same honest scoping boundary as eval E09):

1. **Injection-shaped account names** — `find_account` with `"' OR '1'='1"`, `"Acme'; DROP TABLE Account;--"`, `"%"`, `"*"`, `""`. All five returned `ok: true` with at most the expected fixture matches (0-2 accounts) — no error, no crash, no over-matching. `MockRevenueGateway` uses a plain JS substring check, not string-interpolated SOQL, so there is no injection surface here by construction. (`SalesforceRevenueGateway` does interpolate into SOQL strings — see the note below.)

2. **`confirmedByUser` type confusion** — passed the string `"true"` instead of the boolean `true`. Correctly rejected at schema validation (Zod's `z.boolean()` does not coerce strings) before it ever reached the policy engine.

3. **`discountPercent` edge values** — `NaN`, `Infinity`, `-Infinity`, `-5`, `0`, `100`, `101`, and the string `"20"`. Every genuinely invalid value (`NaN`, `±Infinity`, negative, `101`, string) was rejected at the schema layer (`z.number().min(0).max(100)`) before reaching `evaluateDiscount` at all. `0` was correctly permitted; `100` correctly passed schema (it's ≤100) but was then correctly rejected by the policy engine (`DISCOUNT_REJECTED`, since it's far above the 25% ceiling) — demonstrating the two validation layers (schema bounds, then business policy) compose correctly rather than one silently substituting for the other.

4. **Real concurrent duplicate mutation** — three `create_renewal_quote` calls with the identical `idempotencyKey`, fired via `Promise.all` through the actual MCP transport (not called sequentially, unlike ticket 004's and E07's tests). All three resolved to the exact same `quoteId`. This is a stronger guarantee than the existing idempotency tests proved, since real async interleaving at the transport layer was a genuine opportunity for a race that pure synchronous-call testing wouldn't expose.

5. **Missing required fields** — `create_renewal_quote` with only `accountId`, omitting `termMonths`/`effectiveDate`/`idempotencyKey`/`confirmedByUser`. Correctly rejected at schema validation.

6. **Empty idempotency key** — `idempotencyKey: ""`. Correctly rejected (`z.string().min(1)`).

## Findings

**Zero critical findings.** Every probe either behaved correctly by design or was rejected at the appropriate layer (schema vs. policy). No fabricated success, no bypassed confirmation, no injection surface, no duplicate mutation under real concurrency.

## One note for Phase 3, not a defect in Phase 1/2

`SalesforceRevenueGateway` (ticket 007) does build SOQL via string interpolation (`escapeSoql`, which replaces `'` with `\'`). This probe suite didn't exercise that gateway directly — it's not wired into the MCP server yet. Basic quote-escaping is present, but a full injection audit of the real Salesforce gateway (parameterized queries would be the stronger fix) should happen before that gateway is treated as production-ready, not just demo-ready.
