# ConsultantCloud Revenue Agent

An open-source experiment in making Salesforce Agentforce Revenue Management available through a governed, headless agent experience.

The project combines a TypeScript Revenue Management MCP server, Agentforce, a custom web client, deterministic pricing guardrails, human confirmation and an evaluation harness.

It is an independent open-source project and is not affiliated with or endorsed by Salesforce.

> Revenue work, without the paperwork.

## Status

This repo is a working, tested build of Phases 1, 2, 3, 5, and 6 of the plan in `PROJECT_SPEC.md`. Phase 4 (Agentforce agent configuration) and Phase 7 (final demo recording, screenshots) are not done yet. See `docs/tickets/` for a ticket-by-ticket account of what was built, how, and what was found along the way — including honestly documented gaps, not just successes.

- **Shared contracts, policy engine, MCP server (read + mutation tools), telemetry, headless UI**: built, tested, all passing. 34 tests across the workspace, `next build` succeeds.
- **Real Salesforce integration** (`SalesforceRevenueGateway`): built and live-smoke-tested — account lookup, product search, and quote/opportunity creation work end to end against a real org. The MCP server still wires the mock gateway by default; swapping in the real one is a one-line constructor change once the known gap below is resolved. See `docs/tickets/ticket-007-salesforce-gateway.md`.
- **Known gap**: Salesforce's own RLM "ProductDiscovery Service" hasn't indexed this demo's newly-created products, so adding a quote line item (and therefore the Acme renewal happy path) isn't demoable against live Salesforce yet. Fully demoable against the mock gateway and the headless UI today.
- **Evaluation harness**: all 10 scenarios from `PROJECT_SPEC.md` Section 12 implemented; 9 passed, 1 honestly marked skipped (verifying agent clarification-seeking behavior needs a live agent, which doesn't exist yet). See `evals/results/latest.json`.
- **Red team pass**: zero critical findings across injection, type-confusion, numeric edge-case, real-concurrency, and missing-field probes. See `docs/tickets/ticket-009-red-team.md`.

## How this was built

Every line of application code (everything under `apps/`, `packages/`, `evals/`) was written by a local Qwen 3.8 (27B) model running via Ollama, dispatched ticket-by-ticket through `scripts/qwen.mjs`. An orchestrating Claude Code session wrote no application source — its role was ticket specification, code review against each ticket's acceptance criteria, defect correction (re-dispatching real logic bugs back to the model; only ever hand-fixing mechanical, type-system-forced issues directly), and integration. `docs/tickets/` records this honestly, including several real defects the model produced and how they were caught — this is meant to be a credible account of the process, not a highlight reel.

## Architecture

```
apps/web            ConsultantCloud-branded headless chat + trace UI (Next.js)
packages/shared      Zod schemas, TS types, RevenueGateway interface, MockRevenueGateway
packages/policy      Discount policy, protected-mutation confirmation, idempotency store
packages/revenue-mcp MCP server: 5 read tools + 4 mutation tools, real Salesforce gateway
packages/telemetry   Event schema, structured logger, metrics rollup
evals                10 PROJECT_SPEC scenarios (E01-E10) run against the real MCP server
salesforce           Demo data setup script (Apex)
docs                 Architecture record, ticket-by-ticket build log
```

The rule this project is built around: **the LLM decides what should happen; deterministic services decide whether it's allowed.** Discount thresholds, protected-mutation rules, and idempotency all live in `packages/policy` as data and pure functions — never in a prompt.

## Setup

```bash
pnpm install
pnpm -r build
pnpm -r test
```

For the headless UI:

```bash
pnpm --filter @consultantcloud/web dev
```

For the evaluation suite:

```bash
cd evals && npx tsx runner.ts
```

Real Salesforce integration requires `SF_INSTANCE_URL` and `SF_ACCESS_TOKEN` in a `.env` file (see `.env.example`) — never commit real values. Demo data can be (re-)created idempotently via `sf apex run --file salesforce/scripts/setup-demo-data.apex --target-org <alias>`.

## Demo accounts

Fictional, for demo purposes only:

- **Acme University** — Education, 100 existing Cloud Pro seats, 12% discount, renewal scenario
- **Greenfield Health** — Healthcare, new customer, initial-quote scenario

## License

See `LICENSE`.
