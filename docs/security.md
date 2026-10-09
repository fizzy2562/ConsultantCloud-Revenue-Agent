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
| Secrets scanning in CI | ✅ `.github/workflows/ci.yml` runs gitleaks on every push/PR to `main`, alongside build/test/evals/`pnpm audit`. |
| Dependency audit | ✅ `pnpm audit` runs in CI and reports zero known vulnerabilities. Next.js, the MCP SDK, Vitest and jsforce are kept current; patched versions of transitive dependencies are pinned with `overrides` in `pnpm-workspace.yaml`. |
| No production customer data | ✅ Demo data (Acme University, Greenfield Health) is entirely fictional. |
| Session cookies | ✅ Salesforce access and refresh tokens are kept in httpOnly cookies, AES-256-GCM encrypted with a key from `SESSION_SECRET` (required in production). A tampered cookie is rejected. |
| Hosted deployments | ✅ Visitors who haven't signed in get the demo data, not the deployment's own `SF_*`/`CPQ_*` tokens. A deployer can opt in to sharing the org with `ALLOW_ANONYMOUS_ORG_ACCESS=true`, for a private demo only. The `/api/tools` bridge accepts only its bearer keys, compared in constant time. |

## Known gap carried from the red team pass

`SalesforceRevenueGateway` builds SOQL via string interpolation with a basic `escapeSoql` (single-quote escaping). This is adequate for the demo's query shapes but was not independently red-teamed the way the mock-backed MCP tool layer was (see ticket 009) — it isn't wired into the live MCP server yet. Before treating that gateway as production-ready, either red-team it directly or migrate to parameterized queries.
