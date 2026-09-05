# Ticket 012 — Second fix round from a verification review of ticket-010

Status: DONE

## What this covers

After ticket-010's fix pass was merged and committed, a fresh codex verification review (`codex exec -s danger-full-access --skip-git-repo-check`, a disposable checkout of that commit) was run specifically to check whether ticket-010's claimed fixes actually held up, and whether the fix pass itself introduced anything new. It found five real defects — two brand new (introduced or missed during the fix pass merge), three carried over from the *original* review that ticket-010 never actually fixed despite listing them as addressed. Full verification report: the reviewer's `RESULT.md` is reproduced in the "Findings" section below.

## Findings and fixes

Two codex agents fixed these in parallel on disjoint files (`cc-fix2-gateway`, `cc-fix2-telemetry`), then were merged and verified by the orchestrator, same workflow as ticket-010.

1. **`getAccountAssets()` still masked a real failure as an empty list.** It checked `outputValues === null` before checking `isSuccess`, so a genuine Salesforce failure with null output was reported as `ok: true, data: []`. Fixed: check `isSuccess` first.

2. **Orphaned Opportunity when quote creation *throws*, not just when it fails.** Cleanup only ran when `invokeFlowAction()` returned `isSuccess: false`; if it threw (network/API error), control jumped to the outer catch where the created Opportunity's ID was out of scope. Fixed: the flow-action call is now wrapped in its own try/catch that attempts the same best-effort cleanup before re-throwing.

3. **Quote `status` was still hardcoded `"Draft"`, and product `listPrice` still fabricated `0` for missing price-book entries.** Both were named in the *original* review; ticket-010 neither fixed nor documented them as left open — an accuracy gap in that ticket's own claims. Fixed: both create-quote methods now query the real `Status` field alongside `QuoteNumber`; `ProductSummarySchema.listPrice` and `AccountAssetSchema`'s `productName`/`quantity`/`status` are now nullable, and the gateway returns `null` instead of an invented placeholder when a value is genuinely unknown.

4. **Telemetry wasn't logged when a gateway call threw** — only when it returned an error envelope. E08 deliberately exercises the thrown-exception path and produced zero telemetry for it. Fixed: every read and mutation handler now wraps its body in try/catch, logs an `error`-status event, then re-throws so the exception still propagates (E08's expected behavior is unchanged). Verified for real, not just by inspection: ran the eval suite and grepped the resulting `revenue-mcp-events.jsonl` for `add_quote_line` `"status":"error"` entries — they're present.

5. **Idempotency was payload-blind.** A key reused with a different account/quantity/discount/etc. silently returned the first call's stale result — both for a key that had already resolved and for two concurrent calls racing on the same key. Not listed among ticket-010's honest gaps. Fixed: `IdempotencyStore`/`withIdempotency` now take a `fingerprint` (the caller passes `JSON.stringify(args)`) and throw a new `IdempotencyConflictError` on mismatch, both against the cached result and against another in-flight call. Mutation handlers catch that specific error and return it as a normal `IDEMPOTENCY_KEY_REUSED` tool error rather than an uncaught exception, since key reuse with a different payload is an expected, well-defined condition. New test coverage added in `packages/policy/tests/policy.test.ts` asserting the conflict actually throws.

## What the orchestrator fixed during merge

Making `ProductSummarySchema.listPrice` nullable broke two call sites in `packages/shared/src/mockGateway.ts` that did direct arithmetic assuming a `number` (`quantity * product.listPrice`). The mock's own fixture catalog (`mockData.ts`) always has a real price for every product — the nullability only exists for the real Salesforce gateway's missing-price-book case — so this was a mechanical, type-system-forced fix: added a narrowing cast with a comment explaining why it's safe in the mock's context specifically.

## Verification

- Full workspace `pnpm -r build` clean.
- `pnpm -r test`: 36/36 passing (up from 34 — two new idempotency-conflict tests).
- Evals: 10/11 passing, E09 still honestly skipped (unchanged from ticket-010).
- Telemetry-on-throw verified against real output, not just code inspection (see finding 4 above).

## What's still not fixed (honest gaps, carried forward)

Everything ticket-010 already listed as a deliberate, out-of-scope gap remains accurate and unchanged by this round:

- `get_account_revenue_context` still can't return discount/commercial-term info (needs a `RevenueGateway` interface change).
- `confirmedByUser` is still a caller-supplied boolean standing in for both "confirmed" and "manager-approved" — unchanged, still a deliberate weekend-demo scope decision from ticket 002.
- `runId` is still a fresh UUID per tool call, not per-conversation.

Two smaller items the reviewer flagged as lower-severity and this round left alone:

- `ToolResultSchema` is a plain object schema, not a Zod discriminated union — it doesn't reject `ok: true` without `data` or `ok: false` without `error`. Left out of this round: converting it changes the inferred `ToolResult<T>` TypeScript type everywhere it's used, which is a wider-reaching refactor than a scoped agent pass on disjoint files can safely verify without a full rebuild in the loop. Worth a dedicated follow-up.
- `getQuoteSummary()`'s line-item fallbacks (`"Unknown Product"`, `0` for quantity/discount/price) use the same fabrication pattern fixed elsewhere in this round, but weren't in scope for either fix agent. Noted by fix agent A as a deliberate exclusion; worth folding into the discriminated-union follow-up above since it touches the same schema area.

No further verification review is planned for this pass; the next round should be user-directed rather than another automatic self-check, to avoid an unbounded review→fix→review loop.
