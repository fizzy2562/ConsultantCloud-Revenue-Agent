# Ticket 016 — Product-name resolution and dead-code cleanup

Status: DONE

## What this covers

Two small, unrelated cleanups from the ticket-013/015 punch list, bundled into one dispatch:

1. **`add_quote_line` confirmation cards resolve the real product name.** `agent-runtime` already resolved `accountId`→name and `quoteId`→number for confirmation display; `productId` had no equivalent and showed the raw Salesforce-style ID. Added a `productNames` map populated from `search_products` results the same way `accountNames` is populated from `find_account`, used in `confirmationFor`'s `add_quote_line` case. `quoteLineId` (used in `apply_discount` confirmations) deliberately keeps showing its raw ID — a quote line has no human-readable identifier anywhere in this system, unlike an account or a quote.
2. **Removed the last live-code dependency on `apps/web/lib/mockConversation.ts`** (the data source for the old, fully-scripted pre-live-agent UI). `ToolTracePanel.tsx` was the only file still importing a type from it; given a local, equivalent type definition, and the now-dead file deleted.

## Verification

- Full workspace `pnpm -r build` and `pnpm -r test`: 51/51 tests passing (up from 50).
- Evals: 10/11 passing, E09 still an honest skip.
- Confirmed no remaining references to `mockConversation` anywhere in live code.

## Re-verification of the cross-turn quote resolution gap (ticket-013)

While testing this ticket's merge, replayed the exact scenario that originally surfaced the cross-turn ID resolution problem in ticket-013: renew Acme (creating quote Q-10001) → confirm → in a **new** message, ask to add 250 Cloud Pro seats "to quote Q-10001."

Result: **the underlying capability from ticket-014 (`get_quote_summary` accepting `quoteNumber`) is real and exposed to the model via the tool's description, but the local 27B model didn't reliably use it** — it passed the literal string `"Q-10001"` into the `quoteId` argument of both `add_quote_line` and a retry `get_quote_summary` call, rather than using the `quoteNumber` field the same tool call supports. Both calls correctly failed with `"Quote not found"` rather than silently succeeding against the wrong quote or fabricating one.

Critically, the safety property held throughout: no fabrication, no wrong-quote mutation, and the agent honestly reported the failure and proposed grounded next steps (correctly identifying the real existing quote, Q-10000, and offering concrete options) rather than guessing. This is a **model-competence limitation with a 27B local model**, not a code defect, and not something further prompt engineering was pursued for in this round — the capability is there for a more capable or better-prompted model to use; forcing reliability out of this specific model via more iteration has diminishing returns for a demo. Documented rather than silently dropped.

## What's left

- The model-reliability gap just described (not a code fix; would need prompt iteration or a stronger model to fully close).
- `approvedBy` still isn't identity-verified (ticket-015, unchanged, deliberate).
- Nothing has been pushed to GitHub — everything remains local commits.
- P1/P2 spec items (amendment quotes, multi-currency, Data 360 grounding, etc.) remain unstarted, explicitly deferred by `PROJECT_SPEC.md` itself.
