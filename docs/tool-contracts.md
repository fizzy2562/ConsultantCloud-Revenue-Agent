# Revenue MCP tool contracts

All 12 tools registered by `packages/revenue-mcp/src/server.ts` (`createServer`), backed by either `MockRevenueGateway` or `SalesforceRevenueGateway` behind the same `RevenueGateway` interface (`packages/shared`). Every tool returns the `ToolResult<T>` envelope:

The Salesforce gateway's Flow-action calls use `packages/policy`'s `withRetry` and `CircuitBreaker`: calls receive up to three attempts with exponential backoff, and the circuit opens after three consecutive failed operations for a 30-second cooldown. This covers `getAccountAssets`, `createInitialQuote`, `createRenewalQuote`, `createAmendmentQuote`, `addQuoteLine`, and `applyDiscount`; direct SOQL and `sobject()` calls are not currently covered.

```ts
type ToolResult<T> = {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; retryable: boolean };
  meta: { requestId: string; durationMs: number; source: "salesforce" | "policy" | "mock" };
};
```

## Read tools (never mutate, no confirmation required)

| Tool | Input | Never invents |
|---|---|---|
| `find_account` | `{ name }` | Returns empty array for no match, never a fabricated account |
| `get_account_revenue_context` | `{ accountId }` | Composite: assets + context in one call; empty if none exist |
| `search_products` | `{ query }` | Empty array for no match, never a fabricated product |
| `get_account_assets` | `{ accountId }` | Empty array if the account holds nothing |
| `get_quote_summary` | `{ quoteId }` | `NOT_FOUND` error if the quote doesn't exist, never a fabricated quote |

## Mutation tools (protected, gated through `packages/policy`)

| Tool | Input | Guardrail |
|---|---|---|
| `create_initial_quote` | `{ accountId, termMonths, idempotencyKey, confirmedByUser }` | Always protected — rejects without `confirmedByUser: true` |
| `create_renewal_quote` | `{ accountId, termMonths, effectiveDate, idempotencyKey, confirmedByUser }` | Always protected — rejects without `confirmedByUser: true` |
| `create_amendment_quote` | `{ accountId, sourceQuoteId, idempotencyKey, confirmedByUser }` | Always protected — rejects without `confirmedByUser: true`; copies the source quote's term length |
| `add_quote_line` | `{ quoteId, productId, quantity, idempotencyKey, confirmedByUser }` | Not policy-protected itself, but idempotency-guarded |
| `remove_quote_line` | `{ quoteLineId, idempotencyKey, confirmedByUser }` | Always protected — rejects without `confirmedByUser: true`; removes one line item |
| `update_quote_line` | `{ quoteLineId, quantity, idempotencyKey, confirmedByUser }` | Always protected — rejects without `confirmedByUser: true`; changes quantity only |
| `apply_discount` | `{ quoteId, quoteLineId, discountPercent, idempotencyKey, confirmedByUser }` | 0-15% permitted; 15.01-25% requires `confirmedByUser: true`; >25% rejected outright regardless of confirmation |

Every mutation tool is wrapped in `withIdempotency` — repeated calls with the same `idempotencyKey` return the original result without re-invoking the gateway (verified under real concurrent calls, not just sequential — see `docs/tickets/ticket-009-red-team.md`).

## Error codes

| Code | Meaning | Retryable |
|---|---|---|
| `NOT_FOUND` | Referenced quote/product/line doesn't exist | No |
| `CONFIRMATION_REQUIRED` | Protected action attempted without `confirmedByUser: true` | No — caller must re-confirm and retry |
| `DISCOUNT_REJECTED` | Discount exceeds the 25% policy ceiling | No |
| `SALESFORCE_ERROR` | Real Salesforce API call failed (network, auth, etc.) | Yes |
| `QUOTE_CREATION_FAILED` / `ADD_LINE_FAILED` / `DISCOUNT_APPLY_FAILED` | The underlying RLM flow action reported failure | No (surfaces the action's own error message) |
| `NO_RENEWABLE_ASSETS` | `SalesforceRevenueGateway` only — account has no lifecycle-managed assets to renew | No |
| `NO_SELLING_MODEL` | `SalesforceRevenueGateway` only — couldn't resolve a `ProductSellingModel` for the product | No |

Full schemas: `packages/shared/schemas/index.ts`. Full gateway implementations: `packages/shared/src/mockGateway.ts` (mock) and `packages/revenue-mcp/src/salesforce/salesforceGateway.ts` (real).
