# Ticket 007 — SalesforceRevenueGateway (Phase 3: real Salesforce integration)

Status: DONE (with one documented, unresolved platform limitation)

## What this covers

Not part of the original Phase 1/2 backlog — this is Phase 3 from PROJECT_SPEC.md: swapping the mock gateway for a real one behind the same `RevenueGateway` interface, against the live `trailhead-check` org (`trailhead-4d3-dev-ed.develop.my.salesforce.com`), which was confirmed earlier to have genuine Revenue Cloud Advanced objects provisioned.

## Why this ticket wasn't just "dispatch to Qwen and verify"

Unlike tickets 001-006, this required the orchestrator to do real research and org setup that Qwen has no way to perform, since Qwen only generates file content — it cannot run `sf` CLI commands or touch a live org:

1. **API contract discovery.** PROJECT_SPEC.md names the RLM actions ("Create Initial Quote", "Apply Discount to Quote Line Item", etc.) but not their real parameter shapes. Found the actual invocable actions under `/services/data/v67.0/actions/custom/flow/quotingAI__*` and fetched each one's real input/output schema via the API before writing anything — several real surprises versus a naive reading of the spec:
   - `createInitialQuoteOnOpp` requires an existing **Opportunity**, not just an Account.
   - `createRenewalQuote` operates on an array of **asset IDs** plus explicit start/end dates, not `accountId` + `termMonths`.
   - `getProdtSellModelForPrdct` and `createRenewalQuote`'s `assetIds` are array-typed inputs even though the describe metadata's `type` field doesn't make that obvious (`maxOccurs` is the tell).
2. **Demo data setup.** Created Accounts (Acme University, Greenfield Health), three Products with pricing, a shared `ProductSellingModel` (reusing a pre-seeded "Term Based - Yearly" one rather than creating a duplicate — the org enforces uniqueness on selling-model type+term+unit), and an Opportunity for each account. Script is idempotent and lives at `salesforce/scripts/setup-demo-data.apex`.

## The `SalesforceRevenueGateway` code

Generated via `scripts/qwen.mjs` from one large, precisely-specified brief (every action's real verified contract was handed to Qwen explicitly — this is not something a model could get right by inference alone). Came back essentially correct on the first attempt: consistent try/catch-and-wrap-as-ToolResult error handling across all 8 methods, correct array-vs-singular parameter handling per action, correct SOQL escaping. Five `noUncheckedIndexedAccess` guards were added directly afterward (same mechanical category as every other ticket in this project — TypeScript-forced, not logic changes).

**Live-verified, not just compiled:** ran a real smoke test against `trailhead-check` using the orchestrator's own `sf` CLI session token. Real results:
- `findAccount` — found both Acme University and Greenfield Health by real ID ✓
- `searchProducts` — found Cloud Essentials, Cloud Pro, and (correctly, since it's a real broad match) some pre-existing "Cloud Storage" products ✓
- `createInitialQuote` — **actually created a real Opportunity and a real Quote** in the org (`0Q0Qy0000033CvlKAE`) ✓
- `getQuoteSummary` — retrieved that real quote back, including its true auto-number (`00000030`), distinct from its record ID ✓
- `getAccountAssets` — returns empty for Acme (documented limitation, below), not an error ✓ (correct behavior even though the underlying data isn't there)

## Known, unresolved limitation (real platform behavior, not a code defect)

`addQuoteLine` cannot currently be exercised end-to-end against the newly created demo products. Salesforce's RLM "ProductDiscovery Service" — which `quotingAI__addQuoteLineItemToQuote` and `quotingAI__getProdtSellModelForPrdct` depend on to resolve a product — does not yet recognize `Cloud Pro` / `Cloud Essentials` / `Premium Support`, even after:
- waiting 10+ minutes,
- linking them to a `ProductCategory` (which pre-existing seeded products all have, and which *is* a real prerequisite — just not a sufficient one on its own).

Diagnostic proof this is a product-specific indexing gap, not a broken integration: the identical action call against a **pre-existing seeded product** (`Antivirus`) correctly progressed past the "product not found" stage (it instead reported a missing selling model, a different and expected error for that call shape) — confirming the action-calling code itself is correct.

Similarly, `getAccountAssets` doesn't recognize the directly-inserted demo Asset as "Active"/"Renewable" because fields like `LifecycleEndDate` and `HasLifecycleManagement` are system-managed and only populate through a real quote → contract → asset activation pipeline, not a direct `insert`.

**What this means practically:** the renewal demo path (Acme, 100→250 Cloud Pro seats) is not yet demoable against live Salesforce — it still needs either more time for indexing, an administrator publishing the catalog through Setup, or a real quote pushed through full activation to produce a genuinely lifecycle-managed asset. The initial-quote path (Greenfield) works end-to-end today for account lookup, product search, and quote/opportunity creation — only the "add a specific product line" step is blocked by the same indexing gap.

## What's still mock-only

The MCP tool layer (tickets 003/004) still wires `MockRevenueGateway` in `server.ts` — swapping to `SalesforceRevenueGateway` there is the actual "Saturday afternoon" integration checkpoint, intentionally left undone until the product indexing gap above is resolved or accepted as a known demo caveat. Wiring the swap itself is trivial (constructor injection, already designed for this in ticket 003) — the blocker is org data readiness, not code.
