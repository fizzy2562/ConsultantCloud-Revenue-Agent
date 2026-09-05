# Ticket 011 — Independent review report (codex CLI)

Status: DONE (report archived; findings resolved in ticket-010 where actionable)

Run via `codex exec` (`gpt-5.6-sol`) on `ai-box`, against the full repository state as of commit `2ecd7ca` (post-ticket-009, pre-fix-pass). Codex had no shell/file-system access for this run — every relevant source file was embedded directly in the prompt as text, and codex reasoned over that text only, with explicit instructions not to rubber-stamp anything. See `docs/tickets/ticket-010-codex-review-fixes.md` for what was actually done about each finding.

---

<!-- Full verbatim report follows -->

# Independent static review

## Executive assessment

This is a credible weekend prototype of a deterministic MCP tool layer, but it is not an end-to-end revenue agent and several central safety claims are overstated.

The most serious issues are:

- `confirmedByUser: true` is caller-supplied and therefore does not prove genuine human confirmation.
- "Manager approval" is implemented as that same boolean, so a 20% discount can be applied without a manager.
- The idempotency helper is race-prone against a genuinely asynchronous gateway; the red-team concurrency result does not prove what the documentation says it proves.
- The real Salesforce gateway ignores or fabricates important commercial fields, including renewal dates, quote numbers, status, term, and missing prices.
- Output schemas exist but are not enforced, allowing those incompatible Salesforce results through.
- The UI, telemetry, and evaluation harness are disconnected demonstrations rather than an end-to-end system.

Line numbers below refer to the supplied file contents and may vary slightly with formatting.

---

# Confirmed by reading the code

## Critical: caller-controlled boolean is not genuine human confirmation

**Files/lines**

- `packages/shared/schemas/index.ts`, approximately lines 70-106
- `packages/policy/src/protectedMutations.ts`, lines 25-44
- `packages/revenue-mcp/src/tools/mutations.ts`, approximately lines 35-95
- `apps/web/components/ChatApp.tsx`, approximately lines 35-47

**What is wrong**

Every mutation caller can submit `{ "confirmedByUser": true }`. `requireConfirmation()` merely tests that boolean. There is no confirmation token, session binding, action digest, expiry, nonce, user identity, or record showing that a human actually saw and approved the proposed mutation.

The UI confirmation button does not call the MCP server or mint any authorization artifact. It only changes React state and appends a canned success message.

**Why it matters**

A compromised or hallucinating model can authorize its own protected operation by setting `confirmedByUser: true`. The deterministic layer verifies syntax, not human intent. This directly weakens the core project claim that protected commercial actions require explicit human confirmation, and conflicts with the Section 13 checklist item "confirmation token for writes." Ticket 002 explicitly scoped out a token and redefined the token as a boolean; that is a documented design decision, but not equivalent security.

**Confidence:** Very high.

---

## Critical: manager approval is not implemented

**Files/lines**

- `packages/policy/src/discountPolicy.ts`, lines 12-25
- `packages/policy/src/protectedMutations.ts`, lines 25-44
- `packages/revenue-mcp/src/tools/mutations.ts`, approximately lines 135-177
- `evals/cases/scenarios.ts`, E03
- `docs/tool-contracts.md`, `apply_discount` row

**What is wrong**

The policy correctly categorizes 20% as `approval_required`, but the mutation proceeds whenever `confirmedByUser` is true. The code does not distinguish the requesting sales user confirming an action from a manager approving an exception. There is no manager identity, approval record, approval status lookup, approval token, or separate approval workflow. The UI is even more misleading: clicking "Request approval" immediately appends "Approval request sent," despite no request being made anywhere.

**Confidence:** Very high.

---

## Critical: idempotency has a real concurrent race

**Files/lines**

- `packages/policy/src/idempotencyStore.ts`, lines 18-31
- `packages/revenue-mcp/src/tools/mutations.ts`, lines 14-17 and each `withIdempotency` call
- `packages/shared/src/mockGateway.ts`, approximately lines 65-120
- `docs/tickets/ticket-009-red-team.md`, probe 4

**What is wrong**

```ts
const existing = store.get(key);
if (existing !== undefined) return existing;
const result = await fn();
store.set(key, result);
```

Two concurrent calls can both observe a cache miss before either asynchronous Salesforce operation completes; both then invoke the mutation. The reported concurrency probe used `MockRevenueGateway`, whose quote methods execute all state changes synchronously before their already-resolved promises yield — hiding the race. The probe checks equal quote IDs, not gateway invocation count, so it does not establish that duplicate keys never reach the gateway twice.

**Why it matters**

Against `SalesforceRevenueGateway`, simultaneous requests can create duplicate quotes or lines — exactly the failure idempotency is meant to prevent. A correct implementation stores the in-flight `Promise`, not only its eventual result.

**Confidence:** Very high.

---

## High: idempotency is globally scoped, payload-blind, and caches failures

The four stores are module-level globals shared across every server/gateway in the process, unnamespaced by tenant/user/payload, and cache failed results as if permanent — a transient Salesforce error becomes permanently non-retryable for that key until process restart.

**Confidence:** Very high.

---

## High: the real renewal implementation ignores the requested effective date

`createRenewalQuote()` never uses `input.effectiveDate`; it derives dates from `new Date()` ("now") instead. Contract dates are commercially material and explicitly listed among values the system must never invent.

**Confidence:** Very high.

---

## High: the Salesforce gateway fabricates or substitutes commercial output values

Both quote creation methods returned `quoteNumber: quoteId`; both hardcoded `status: "Draft"`; `getQuoteSummary()` returned `termMonths: 0`; product search returned `listPrice: 0` when no price-book entry existed. The spec explicitly says never fabricate Salesforce IDs, prices, quote state, or contract dates.

**Confidence:** Very high.

---

## High: output schemas are not actually enforced

Tool handlers serialized whatever the gateway returned with no `.safeParse()` against the output schema and no MCP `outputSchema` registered — a pure type-system cast with no runtime check, which is why fabricated/invalid values could reach the caller undetected.

**Confidence:** Very high.

---

## High: successful quote-line creation could return an empty line ID

`lineRecords.records[0]?.Id ?? ""` reported success with an empty ID when the follow-up query found nothing.

**Confidence:** Very high.

---

## High: the UI claims mutations completed before confirmation

The full trace (including the `WRITE` completion entry) rendered immediately when a flow started, before the confirmation card was answered — a screenshot could show a write as complete while consent was still pending.

**Confidence:** Very high.

---

## High: telemetry is not integrated, persisted, or a "full tool-call trace"

No MCP handler called the telemetry package; the UI trace was hardcoded, not produced by real execution; only an in-memory sink existed despite ticket 006 requiring persistence.

**Confidence:** Very high.

---

## Medium-high: account revenue context does not provide the claimed commercial context

`get_account_revenue_context` called only `getAccountAssets()` and never returned account, industry, discount, or contract information despite its own ticket and description claiming otherwise.

**Confidence:** Very high.

---

## Medium-high: input validation has important commercial gaps

IDs allowed empty strings; `effectiveDate` was an unconstrained string; `quantity` permitted zero/negative/fractional values; several output IDs allowed empty strings.

**Confidence:** High.

---

## Medium-high: failure behavior differs materially between gateways

E08 tested an uncaught-throw failure mode that the real gateway never produces (it always catches and returns `ok: false`), so the eval didn't exercise the realistic failure path. Separately, `getAccountAssets()` converted a flow action's `isSuccess: false` into `ok: true, data: []`, masking real failures as "no assets."

**Confidence:** Very high.

---

## Medium: the evaluation results overstate scenario coverage

E01 never exercised the seat increase to 250 despite being named "Happy renewal" with that exact request. Several other scenarios tested narrower slices than their names implied.

**Confidence:** Very high.

---

## Medium: the common gateway interface hides real semantic incompatibilities

Mock and Salesforce implementations satisfied the same TypeScript signature with materially different semantics (dates, quote numbers, idempotency ownership, failure shapes).

**Confidence:** Very high.

---

## Medium: quote creation could mutate Salesforce before ultimately returning failure

`createInitialQuote()` could create an Opportunity, then fail the quote-creation step and leave the Opportunity orphaned.

**Confidence:** High.

---

## Medium: metrics are tool metrics mislabeled as task metrics

`successfulTaskRate` was a tool-level success ratio, not a task-level one; `endToEndDurationMs` combined timestamps across unrelated runs.

**Confidence:** Very high.

---

## Medium: README's "working, tested build" framing is too broad

The README disclosed the absent Agentforce layer and default mock wiring, but broader wording still implied more end-to-end integration than existed (no orchestration/API layer connecting UI to MCP to Salesforce to telemetry).

**Confidence:** Very high.

---

## Security review: no embedded credential found

No hardcoded access token, password, private key, or credential-like fixture was found in the supplied files.

**Confidence:** High, limited to the supplied files, not full repository history.

---

# Suspected; would need execution or Salesforce-specific verification

- **SOQL escaping may be bypassable through backslash handling** — `escapeSoql()` didn't escape existing backslashes, and `%`/`_` wildcards in `LIKE` clauses weren't neutralized, allowing intentional overmatching at minimum.
- **Salesforce action output property names may not match runtime results consistently** — unchecked type assertions on flow-action `outputValues` with no runtime schema validation.

---

# P0 gaps beyond the documented Salesforce indexing limitation

No end-to-end orchestrator connects reads, confirmation, mutations, and summary; the "headless application" has no API route or MCP client; genuine human approval is boolean-only; tool-call tracing is disconnected from real execution; Agentforce configuration is openly not built.

---

# Overall take

The project is honest about several large limitations — especially the absent Agentforce layer, default mock wiring, and Salesforce catalog/asset problems. That candor makes it more credible than a typical weekend demo. However, the documentation substantially oversold the core guardrails and integration at the time of this review: a boolean described as human confirmation and as manager approval, a mock-masked race described as proven concurrent idempotency, unvalidated gateway output described as sanitized, disconnected telemetry described as full tracing, narrow MCP probes presented as scenario evaluations, and a canned UI showing writes as completed before confirmation.

**Conclusion at time of review:** a respectable collection of prototype components with a reasonably sound discount threshold check, but not yet credible evidence of a governed, end-to-end Revenue Management agent. See ticket-010 for what was fixed afterward.
