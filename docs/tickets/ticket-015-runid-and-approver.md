# Ticket 015 — Per-conversation runId and real approver capture (batch 2 of 2)

Status: DONE

## What this covers

The last two documented gaps from ticket-013's live testing, fixed together since both touch the MCP server, the agent runtime, and the web UI. Dispatched as one codex (`gpt-5.6-sol`) ticket, sequentially after ticket-014 (which touched the same core schema/tools files and would have conflicted with a parallel dispatch).

1. **`runId` is now stable across a whole conversation, not a fresh UUID per tool call.** `createServer(gateway, options?: { runId? })` accepts an optional run ID, threaded through every `registerXxx` function in `tools/index.ts` and `tools/mutations.ts` down to `respond()`'s `logToolCallEvent` call — falling back to a fresh UUID when none is supplied, so existing direct callers (tests, evals) are unaffected. `ChatApp.tsx` generates one `conversationId` per browser session (`useState(() => crypto.randomUUID())`) and sends it on every request; `route.ts` passes it through to `runAgentTurn(..., { runId: conversationId })`, which forwards it into `createServer`. `computeMetricsByRun` (from ticket-010) can now actually group a real conversation's tool calls together.

2. **The manager-approval discount band (15.01–25%) now requires a named approver, not just a second click of the same confirm button.** `ApplyDiscountInputSchema` gained an optional `approvedBy` field; `apply_discount`'s handler rejects with a new `APPROVER_REQUIRED` error (classified as `policy_blocked` telemetry, alongside `CONFIRMATION_REQUIRED`/`DISCOUNT_REJECTED`) when the discount is in the approval-required band and `approvedBy` is missing or empty — even if `confirmedByUser` is true. `agent-runtime` (now depending on `@consultantcloud/policy` directly) evaluates the discount band itself when building the confirmation card and sets `requiresApproverName: true` on it when applicable; the runtime, not the model, attaches `approvedBy` to the executed tool call when an approver name was actually supplied at confirm time. `ConfirmationCard.tsx` renders a required text input for this case and disables the confirm button until it's filled in.

This is explicitly **not** real authentication — there's still no verification that the named person is actually a manager. It's a genuine, honest improvement over a bare boolean (an approver must now be named and recorded, and the system distinguishes "not confirmed" from "confirmed but no approver named"), not a security boundary. Documented as a remaining honest gap, not silently dropped.

## What the orchestrator fixed during merge

E03 ("Approval discount") failed after merging — it called `apply_discount` directly at the MCP layer with `confirmedByUser: true` for a 20% discount but no `approvedBy`, which now correctly gets rejected. This was a test fixture needing an update to match the new contract, not a design decision (`evals/cases/scenarios.ts` was explicitly out of this ticket's scope). Fixed directly: E03 now asserts the `APPROVER_REQUIRED` rejection first, then supplies `approvedBy: "Jordan Rivera"` for the successful case — strictly more thorough than before, not just patched to pass.

## Verification

- Full workspace `pnpm -r build` and `pnpm -r test`: 50/50 tests passing (up from 46).
- Evals: 10/11 passing after the E03 fixture fix, E09 still an honest skip.
- Verified live in a real browser against the real Ollama-hosted model: the 20% discount flow now shows a required "Approving manager's name" field, the confirm button stays disabled until it's filled in, and the discount is applied for real (`WRITE apply_discount` trace entry) only once both a confirmation and a name are present.

## What's left (honest gaps, not silently dropped)

- `approvedBy` is a free-text name, not a verified identity — no real auth boundary exists in this project.
- The live agent's confirmation summaries still show raw Salesforce-style IDs for anything not already resolved to a display name/number within the same turn (e.g. `productId`, `quoteLineId`) — only `accountId`→name and `quoteId`→number resolution exist (ticket-013's refinement round).
- Cross-turn entity resolution (referencing a quote by its display number in a *new* conversation turn) is unaffected by this ticket — `get_quote_summary` accepting `quoteNumber` (ticket-014) already closes much of this gap going forward, but wasn't re-verified against the specific multi-turn scenario documented in ticket-013.

This closes out the punch list from ticket-012/013. No further fix tickets are queued; anything further is new scope, not a known gap.
