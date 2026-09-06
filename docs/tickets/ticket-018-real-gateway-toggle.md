# Ticket 018 — Selectable real Salesforce gateway

Status: DONE

## What this covers

The live agent always used `MockRevenueGateway`. `SalesforceRevenueGateway` and `createSalesforceConnection` already existed and were live-smoke-tested against a real org (ticket-007) but were never wired into the running app. `packages/revenue-mcp/src/server.ts` now exports `createRevenueGateway()`, which returns a real `SalesforceRevenueGateway` when both `SF_INSTANCE_URL` and `SF_ACCESS_TOKEN` are set in the environment, and `MockRevenueGateway` otherwise — the safe default. `apps/web/app/api/chat/route.ts` uses it instead of hardcoding the mock.

## Verification

- Full workspace `pnpm -r build`/`pnpm -r test`: 54/54 tests passing, no regressions (default behavior with no Salesforce env vars set is unchanged — still the mock).
- No real Salesforce connection was attempted as part of this ticket — no credentials exist in any dispatch checkout, and none should. Testing against a real org (setting `.env.local` with real values) is a separate, manual step for whoever has access to the demo org.

## What's left

Nothing code-side. To actually demo against live Salesforce: set `SF_INSTANCE_URL`/`SF_ACCESS_TOKEN` in a local `.env` (never commit it), restart the dev server. The known ticket-007 gap still applies: Salesforce's RLM "ProductDiscovery Service" hadn't indexed this demo's newly-created products at the time of that ticket, so `add_quote_line`/`create_renewal_quote` may not work against live Salesforce until that's re-verified — read-only tools (`find_account`, `search_products`, `get_account_assets`) should work regardless.
