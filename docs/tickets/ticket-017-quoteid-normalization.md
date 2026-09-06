# Ticket 017 — Deterministic quote identifier normalization

Status: DONE

## What this covers

Closes the model-competence gap documented in ticket-016: a 27B local model doesn't reliably choose `get_quote_summary`'s `quoteNumber` field over `quoteId` when it only knows a quote's display number (e.g. `"Q-10001"`) rather than its real Salesforce-style ID. Rather than relying on prompt tuning to make the model more reliable, this adds a deterministic safety net in code — consistent with this project's whole approach of putting guardrails in the deterministic layer rather than trusting model behavior.

`packages/agent-runtime/src/index.ts` gained:
- `looksLikeSalesforceId(value)` — detects the real 15/18-character alphanumeric Salesforce ID shape.
- `resolveQuoteId(client, candidate)` — passes real IDs through unchanged (no extra lookup call); for anything else, resolves it via a real `get_quote_summary({ quoteNumber: candidate })` call and returns the real ID if found, otherwise falls through unchanged so the eventual tool call still fails with a clear, honest `NOT_FOUND` rather than doing nothing silently.

Applied at every place a `quoteId` reaches a real tool call: the read-tool loop (covers `get_quote_summary` itself), `confirmationFor()` when building a mutation's `PendingConfirmation` (the resolved ID is stored back into `pending.args`, not just the displayed summary line), and again defensively at confirm-execution time in case a `PendingConfirmation` was constructed directly rather than via `confirmationFor` (as the test suite itself does).

## Verification

- Full workspace `pnpm -r build` and `pnpm -r test`: 54/54 tests passing (up from 51).
- Evals: 10/11 passing, E09 still an honest skip.
- **Re-ran the exact failing scenario from ticket-016 live**, against the real Ollama-hosted model: "Add 50 more Cloud Pro seats to quote Q-10000" (a fresh message, quote known only by display number) now resolves `get_quote_summary` successfully on the first real call, proposes a correct confirmation (`Quote: Q-10000`, real product name, real quantity), and the confirmed `add_quote_line` write succeeds for real — the exact case that previously failed with "Quote not found" now completes cleanly with a real quote line ID.

## What's left

Only the two intentionally-out-of-scope items from ticket-015/016 remain:
- `approvedBy` is a recorded name, not a verified identity — building real authentication (Salesforce SSO/OAuth) is a materially larger feature than anything in this punch list and was deliberately not attempted here; faking verification would violate this project's own never-fabricate principle.
- P1/P2 items from `PROJECT_SPEC.md` (amendment quotes, multi-currency, Data 360 grounding, etc.) remain unstarted — explicitly deferred by the spec itself as later-phase scope, not part of this weekend build's punch list.

This closes the punch list. Nothing further is queued.
