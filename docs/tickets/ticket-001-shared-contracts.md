# Ticket 001 — Shared contracts, mock gateway, monorepo skeleton

Status: DONE

## Review notes

Generated file-by-file via `scripts/qwen.mjs` (qwen3.8:27b, think:false) against focused per-file briefs, reviewed and integrated by the orchestrator. Two real defects caught and corrected before merge:
- `mockData.ts` round 1 used a field name (`listPriceUsdPerSeatPerYear`) that didn't match `ProductSummarySchema`'s actual `listPrice` field — re-dispatched with the defect named, fixed on round 2.
- `mockGateway.ts` round 1 had a stray filename header line before the code (not valid syntax); round 2 fixed that but regressed two other things (dropped `async`/`Promise` return types, added an extra `termMonths` field that doesn't exist on `QuoteResult`). Used round 1's verified-correct body with only the stray header line removed, rather than risking a third regeneration.

Verified: `pnpm -r build` green across all 4 packages, `pnpm --filter shared test` 6/6 passing, no `any` types in the package.

## Goal

Establish the one interface every other ticket in this project builds against. Nothing else can start until this lands, so scope is deliberately narrow: types, schemas, a mock implementation, and a build that turns green. No UI, no MCP server, no Salesforce calls.

## Files you may create or touch

```
pnpm-workspace.yaml
package.json
tsconfig.base.json
.gitignore
.env.example
packages/shared/package.json
packages/shared/tsconfig.json
packages/shared/schemas/*.ts
packages/shared/types/*.ts
packages/shared/src/mockGateway.ts
packages/shared/src/mockData.ts
packages/shared/tests/mockGateway.test.ts
apps/web/package.json          (empty Next.js shell only — no pages/components yet)
packages/revenue-mcp/package.json   (empty shell only — no server logic yet)
```

Do not create anything under `salesforce/` or `evals/` in this ticket — those come later.

## Required interface (verbatim from PROJECT_SPEC.md Section 15)

```ts
export interface RevenueGateway {
  findAccount(input: FindAccountInput): Promise<AccountSummary[]>;
  getAccountAssets(input: AccountIdInput): Promise<AccountAsset[]>;
  searchProducts(input: ProductSearchInput): Promise<ProductSummary[]>;
  createInitialQuote(input: CreateInitialQuoteInput): Promise<QuoteResult>;
  createRenewalQuote(input: CreateRenewalQuoteInput): Promise<QuoteResult>;
  addQuoteLine(input: AddQuoteLineInput): Promise<QuoteLineResult>;
  applyDiscount(input: ApplyDiscountInput): Promise<DiscountResult>;
  getQuoteSummary(input: QuoteIdInput): Promise<QuoteSummary>;
}
```

You must define every input/output type referenced above, plus the shared envelope (PROJECT_SPEC.md Section 7):

```ts
type ToolResult<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  meta: {
    requestId: string;
    durationMs: number;
    source: "salesforce" | "policy" | "mock";
  };
};
```

Every `RevenueGateway` method returns `Promise<ToolResult<X>>` for the appropriate `X` — the method signatures above are simplified in the spec; wrap each return type in `ToolResult<...>`.

For each type, write a corresponding Zod schema in `packages/shared/schemas/` with the same name + `Schema` suffix (e.g. `FindAccountInput` -> `FindAccountInputSchema`). The TS types in `packages/shared/types/` should be inferred from the Zod schemas via `z.infer<...>`, not hand-duplicated — this is the pattern the rest of the project will follow.

All mutation input types (`CreateInitialQuoteInput`, `CreateRenewalQuoteInput`, `AddQuoteLineInput`, `ApplyDiscountInput`) must include:
- `idempotencyKey: string`
- `confirmedByUser: boolean`

## Mock data (`packages/shared/src/mockData.ts`)

Two accounts, three products, from PROJECT_SPEC.md Section 5:

**Acme University** — industry Education, 100 existing Cloud Pro seats, annual contract, current discount 12%, renewal due within 60 days. Give it a fixed fake Salesforce-shaped ID (e.g. `001000000000001AAA`) and at least one existing `AccountAsset` reflecting the 100 Cloud Pro seats.

**Greenfield Health** — new customer, no existing assets, fixed fake ID (e.g. `001000000000002AAA`).

**Products**: Cloud Essentials, Cloud Pro, Premium Support — realistic but fictional pricing, fixed fake product IDs.

## `MockRevenueGateway`

Implements `RevenueGateway` entirely in-memory against the fixtures above:
- `findAccount` does case-insensitive substring match on name.
- `createInitialQuote` / `createRenewalQuote` must respect `idempotencyKey`: calling twice with the same key returns the same `quoteId` and does not create a second quote in the in-memory store. This is a correctness requirement, not a nice-to-have — a later eval scenario (E07) specifically tests duplicate-mutation behavior against this exact contract.
- No discount policy enforcement here — that is ticket 002's job (policy/guardrail engine). `applyDiscount` in the mock just applies whatever discount it's given and returns success; policy gating gets layered in front of the gateway later, not inside it.

## What this ticket must never do

- Never call any Salesforce API — this is a pure in-memory mock.
- Never hardcode a discount policy threshold inside the gateway (Section 6) — that belongs in ticket 002.
- Never invent a response shape that doesn't match the Zod schema — schema is the source of truth, not convenience.

## Acceptance criteria

1. `pnpm install && pnpm build` succeeds from repo root with placeholder `apps/web` and `packages/revenue-mcp` packages present (they can be empty shells that just build, e.g. a single `index.ts` exporting nothing).
2. `pnpm --filter shared test` runs Vitest and passes, covering at minimum:
   - `findAccount` matches "Acme" and "Greenfield" correctly, returns empty array for unknown names.
   - `createInitialQuote` called twice with the same `idempotencyKey` returns the same `quoteId` both times.
   - A schema round-trip test: constructing a valid `CreateRenewalQuoteInput` and parsing it through `CreateRenewalQuoteInputSchema` succeeds; an invalid one (missing `idempotencyKey`) fails validation.
3. TypeScript strict mode is on in `tsconfig.base.json` and there are no `any` types in the public interface surface.
4. `.env.example` exists (can be empty/placeholder for now — Salesforce secrets come in ticket for Phase 3) and `.gitignore` excludes `.env`.

## Out of scope (do not build these here)

- Policy engine (ticket 002)
- Actual MCP tool implementations (ticket 003+)
- UI (separate ticket)
- SalesforceRevenueGateway (Phase 3)
