# Ticket 019 — Remove and update quote line items

Status: DONE

## What this covers

The tool set could only *add* a quote line item — no way to remove one or change its quantity, a real functional gap (an agent that can build a quote but never correct it). Added `remove_quote_line` and `update_quote_line` (quantity only — discount changes stay `apply_discount`'s job) across the full stack: schema, `RevenueGateway` interface, both gateway implementations, MCP tool registration, and the live agent's confirmation gate.

Dispatched as two parallel, file-disjoint pieces against a contract fixed up front: **codex** built the core (schema, types, `MockRevenueGateway`, MCP tool registration, agent-runtime wiring, docs) while **Qwen** built the isolated `SalesforceRevenueGateway` implementation of the same two methods (a single-file, mechanical addition well-suited to Qwen's demonstrated strength once given the exact contract and full current file content).

## What the orchestrator fixed during merge

- Both new MCP tool handlers called `requireConfirmation("create_initial_quote", ...)` instead of `requireConfirmation("remove_quote_line", ...)` / `requireConfirmation("update_quote_line", ...)` — a workaround for a real scoping gap: `packages/policy/src/protectedMutations.ts` (which defines the `MutationAction` union type) wasn't in codex's allowed file list, so it couldn't add the two new action names and reused an existing valid one instead. This happened to produce *correct runtime behavior* (both borrowed and real actions are in the unconditionally-protected set) but was fragile, mislabeled code. Fixed properly: added `remove_quote_line`/`update_quote_line` to `MutationAction` and to `isProtectedMutation`'s unconditionally-protected list, then corrected both call sites to use their real action names.
- `packages/revenue-mcp/tests/server.test.ts`'s tool-inventory assertion needed the two new tool names added — a pre-existing test outside either dispatch's file scope, exactly the kind of mechanical, contract-forced update ticket-010 established as the orchestrator's job.
- `evals/cases/scenarios.ts`'s two hand-written test-double gateways (`FailingGateway`, `ReturningFailureGateway`) needed `removeQuoteLine`/`updateQuoteLine` stubs added (delegating to their wrapped `MockRevenueGateway`, matching every other non-overridden method already on those classes) to satisfy the now-larger `RevenueGateway` interface.

## Verification

- Full workspace `pnpm -r build`/`pnpm -r test`: 60/60 tests passing (up from 54).
- Evals: 10/11 passing, E09 still an honest skip.
- New tests cover: removing/updating an existing line (mock), `NOT_FOUND` for a missing line, quantity update recomputing `netPrice` while preserving `discountPercent`, and both tools being gated behind a real confirmation round-trip in the live agent (spying on the gateway to prove no auto-execution).

## What's left

Nothing code-side for this specific feature. `SalesforceRevenueGateway`'s two new methods use plain `destroy`/`update` calls on `QuoteLineItem` (matching every other DML pattern already in that file) and haven't been tested against a real org — same caveat as every other Salesforce-gateway method in this project until ticket-018's real-gateway toggle is actually exercised with real credentials.
