# ConsultantCloud Revenue Agent

An open-source experiment in making Salesforce Agentforce Revenue Management available through a governed, headless agent experience.

The project combines a TypeScript Revenue Management MCP server (calling real Salesforce Agentforce Revenue Management flow actions), a custom live agent that reasons over it, a custom web client, deterministic pricing guardrails, human confirmation and an evaluation harness. It does not use Salesforce's own Agentforce Studio agent builder — the live agent here is fully custom.

It is an independent open-source project and is not affiliated with or endorsed by Salesforce.

> Revenue work, without the paperwork.

## Status

This repo is a complete, working build of the plan in `PROJECT_SPEC.md`, including a genuine live agent — not just the deterministic tool layer beneath it. See `docs/tickets/` for a ticket-by-ticket account of what was built, how, and what was found along the way, including two independent review rounds and every defect they turned up — this is meant to be a credible account of the process, not a highlight reel.

- **A real live agent** (`packages/agent-runtime`): connects to the real MCP server in-process, discovers its tool schemas at runtime, and reasons over them with OpenRouter's hosted `liquid/lfm-2.5-2.6b:free` model. The headless UI (`apps/web`) calls it over a real API route — nothing in the running app is scripted. The confirmation gate is structural, not model-trusted: the runtime, not the model, decides whether a mutation actually executes, and itself controls `confirmedByUser`/`idempotencyKey` regardless of what the model puts in a tool call.
- **Shared contracts, policy engine, MCP server (5 read + 4 mutation tools), telemetry, headless UI**: built, tested, all passing — 54 tests across the workspace, `pnpm -r build` succeeds clean.
- **Real Salesforce integration** (`SalesforceRevenueGateway`): built and live-smoke-tested — account lookup, product search, and quote/opportunity creation work end to end against a real org. The app wires the mock gateway by default for the live agent demo; swapping in the real one is a one-line constructor change. **Known gap**: Salesforce's own RLM "ProductDiscovery Service" hasn't indexed this demo's newly-created products, so adding a quote line item isn't demoable against live Salesforce yet — fully demoable against the mock gateway today.
- **Evaluation harness**: 10 scenarios from `PROJECT_SPEC.md` Section 12; 9 pass deterministically, 1 (verifying agent clarification-seeking behavior) is honestly skipped rather than faked — it needs a live, non-deterministic model in the loop, which doesn't belong in a fast deterministic suite. See `evals/results/latest.json`.
- **Red team pass**: zero critical findings across injection, type-confusion, numeric edge-case, real-concurrency, and missing-field probes. See `docs/tickets/ticket-009-red-team.md`.
- **Two independent review rounds** (codex, run separately from the model that built the code) found and fixed real defects across every layer — a caller-controlled confirmation boolean, an idempotency race, output fabrication in the Salesforce gateway, a UI trace that could show a write as complete before confirmation, and more. See `docs/tickets/ticket-011` through `ticket-017`.
- **Honestly-disclosed, deliberately out-of-scope gaps**: `approvedBy` (required for the manager-approval discount band) is a recorded name, not a verified identity — this project has no real authentication, and faking identity verification would violate its own never-fabricate principle. P1/P2 items from `PROJECT_SPEC.md` (amendment quotes, multi-currency, Data 360 grounding, a hosted sandbox demo) remain unstarted — explicitly deferred by the spec itself as later-phase scope.

## How this was built

Every line of application code (everything under `apps/`, `packages/`, `evals/`) was written by two different models, never by the orchestrating Claude Code session directly: a local Qwen 3.8 (27B) model running via Ollama (dispatched ticket-by-ticket through `scripts/qwen.mjs`) wrote the original P0 build and several later fixes; codex (via the Codex CLI) wrote the live agent runtime, two independent review rounds, and the fix passes those reviews produced. The live runtime now uses OpenRouter's hosted Liquid model.

The orchestrator's role throughout was ticket specification, independent code review, defect correction (re-dispatching real logic bugs back to a model; only ever hand-fixing mechanical, type-system-forced issues — a dropped file extension, a type-narrowing cast — directly), and integration. `docs/tickets/` records this honestly, including several real defects each model produced and how they were caught.

## Architecture

```
apps/web              ConsultantCloud-branded headless chat + trace UI (Next.js), calls the live agent via /api/chat
packages/agent-runtime The live agent: connects to the real MCP server, reasons over its tools via OpenRouter's hosted API
packages/shared        Zod schemas, TS types, RevenueGateway interface, MockRevenueGateway
packages/policy        Discount policy, protected-mutation confirmation, idempotency store
packages/revenue-mcp   MCP server: 5 read tools + 4 mutation tools, real Salesforce gateway
packages/telemetry     Event schema, structured logger, metrics rollup
evals                  10 PROJECT_SPEC scenarios (E01-E10) run against the real MCP server
salesforce             Demo data setup script (Apex)
docs                   Architecture record, ticket-by-ticket build log
```

The rule this project is built around: **the LLM decides what should happen; deterministic services decide whether it's allowed.** Discount thresholds, protected-mutation rules, and idempotency all live in `packages/policy` as data and pure functions — never in a prompt. The same rule governs the live agent itself: `packages/agent-runtime` decides whether a mutation the model requested actually executes — never the model.

## Setup

```bash
pnpm install
pnpm -r build
pnpm -r test
```

The live agent uses OpenRouter's OpenAI-compatible chat completions API. Set `LLM_API_KEY`; the endpoint defaults to `https://openrouter.ai/api/v1/chat/completions` and the model defaults to `liquid/lfm-2.5-2.6b:free`. Override them with `LLM_API_URL` and `LLM_MODEL` when needed.

For the headless UI (with `LLM_API_KEY` set):

```bash
pnpm --filter @consultantcloud/web dev
```

For the evaluation suite (deterministic, no hosted LLM required — it talks to the MCP server directly):

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
