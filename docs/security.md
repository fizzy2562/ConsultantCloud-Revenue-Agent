# Security

Status against PROJECT_SPEC.md Section 13's checklist, as of this build:

| Item | Status |
|---|---|
| OAuth, never username/password in code | ✅ `SalesforceRevenueGateway` takes a pre-authenticated `Connection`; `auth.ts` reads `SF_INSTANCE_URL`/`SF_ACCESS_TOKEN` from environment only. No credentials in source. |
| `.env` excluded from git | ✅ `.gitignore`; verified no `.env` file has ever been tracked. |
| Principle of least privilege | ⚠️ Demo uses the developer's own `sf` CLI session token for live testing (see `docs/tickets/ticket-007-salesforce-gateway.md`). A production deployment must use a dedicated permission-set-scoped integration user via JWT Bearer or Client Credentials flow — not built in this pass, documented as a known gap. |
| Permission-set-based Salesforce user | ⚠️ Same gap as above — not yet provisioned as a dedicated integration user. |
| No raw arbitrary SOQL mutation tool | ✅ No tool exposes raw SOQL. Read tools use fixed, parameterized query shapes. |
| Schema validation for every MCP input | ✅ Every tool's `inputSchema` is a Zod-derived shape; verified via red team pass (ticket 009) that malformed types, out-of-range numbers, and missing fields are all rejected before reaching business logic. |
| Output sanitization | ✅ Every tool response is the `ToolResult<T>` envelope built from typed data, never raw pass-through of an untyped external response. |
| Idempotency for writes | ✅ All four mutation tools wrapped in `withIdempotency`; verified under real concurrent calls (not just sequential), see ticket 009 probe 4. |
| Deterministic policy engine | ✅ `packages/policy` — discount thresholds and protected-mutation rules are data/pure functions, never in a prompt. |
| Confirmation token for writes | ✅ `confirmedByUser: true` required and checked before any protected mutation reaches the gateway; verified type confusion (string `"true"`) is rejected, not coerced. |
| Secrets scanning in CI | ⚠️ Manually scanned before this commit (grep for key/token patterns, verified `.env` never tracked). No automated CI secrets-scanning step configured yet — recommended before `v0.1.0` tag. |
| Dependency audit | ⚠️ Not run in this pass. Recommended: `pnpm audit` before release. |
| No production customer data | ✅ Demo data (Acme University, Greenfield Health) is entirely fictional. |

## Known gap carried from the red team pass

`SalesforceRevenueGateway` builds SOQL via string interpolation with a basic `escapeSoql` (single-quote escaping). This is adequate for the demo's query shapes but was not independently red-teamed the way the mock-backed MCP tool layer was (see ticket 009) — it isn't wired into the live MCP server yet. Before treating that gateway as production-ready, either red-team it directly or migrate to parameterized queries.
