# Architecture & Phase 0 tuning record

## Operating model

Claude Code is orchestrator/tech-lead only: it writes ticket specs (`docs/tickets/`), reviews Qwen's output against each ticket's acceptance criteria and PROJECT_SPEC.md's guardrails (Section 6) and security checklist (Section 13), and runs `pnpm build/test/lint`. It does not edit files under `apps/`, `packages/`, `salesforce/`, or `evals/`. Qwen 3.8 (via Ollama on `ai-box`) is the sole author of source code in those directories and commits its own work, so git history reflects honest provenance.

## Infrastructure (verified 2026-09-05)

- **Salesforce**: `sf` CLI on the orchestrator's machine is already authenticated to the demo org (alias `trailhead-check`, instance `trailhead-4d3-dev-ed.develop.my.salesforce.com`). Confirmed via global describe that the org has genuine Revenue Cloud Advanced objects provisioned (`ProductSellingModel`, `QuoteLineDetail`, `RevenueAsyncOperation`, `QuoteLineRateCardEntry`, etc.) — this is not a vanilla Developer Edition.
- **Qwen/Ollama**: `ai-box` (AMD Strix Halo, AMD Radeon 8060S integrated GPU, 128GB total unified memory — 96GB allocated to dedicated GPU/VRAM, ~32GB visible to the Windows OS as system RAM) is reachable over SSH. Ollama's server must be started via its `OllamaAutoStart` scheduled task — launching the `ollama` binary directly over a raw SSH session fails (`Unable to init instance`) because there is no interactive desktop session in that context.
- **Model baseline**: `qwen3.8:27b` (the tag confirmed as the one used for fizzyCPQ and org-advisor). Other tags present on the box (`hermes-qwen38:64k`, `orcarouter/Qwen3.8-27B-Uncensored:q4_K_M`) are not used for this project.
- **Ollama config already set machine-wide**: `OLLAMA_NUM_PARALLEL=5`, `OLLAMA_CONTEXT_LENGTH=32768`. Left as-is (see conclusion below — not worth changing).

## Important model behavior: `qwen3.8:27b` is a reasoning model

It returns a separate hidden `thinking` field distinct from the final `response` text via Ollama's `/api/generate`. A generation budget (`num_predict`) that's too small gets consumed entirely by hidden reasoning, producing an **empty visible response** even though the token cap was hit — this is silent and easy to mistake for the model "not answering." Ticket-dispatch tooling must set a generous max-token budget per turn (3000+, not a few hundred) or the agent loop will appear to hang/produce nothing.

## Phase 0 benchmark

**Representative task**: generate a Zod input/output schema pair, a generic `ToolResult<T>` wrapper, and one Vitest test file — a small but real ticket-shaped deliverable (per PROJECT_SPEC.md Section 7's `ToolResult` envelope).

**Run 1 (flawed, kept here for transparency)**: `num_predict=500`, concurrency 1/2/3/5. Every single request hit the 500-token cap with an empty visible `response` — the model was still inside its `thinking` phase for this harder prompt when cut off. The throughput numbers from this run measure "tokens/sec while thinking," not usable ticket throughput, and are not the basis for the decision below.

| concurrency | batch wall (ms) | agg tok/s |
|---|---|---|
| 1 | 54,416 | 9.19 (cold model load included) |
| 2 | 46,978 | 21.29 |
| 3 | 71,989 | 20.84 |
| 5 | 118,146 | 21.16 |

Even with the flawed methodology, the aggregate tok/s plateau from concurrency 2→5 (~21 tok/s, flat) was the first signal that this box is compute-bound rather than memory-bound.

**Run 2 (corrected)**: `num_predict=3000`, same prompt, concurrency 1 and 2, warm model.

| concurrency | batch wall (ms) | total tokens | agg tok/s | avg per-request latency (ms) |
|---|---|---|---|---|
| 1 | 77,045 | 1,800 | 23.36 | 75,393 |
| 2 | 149,110 | 3,597 | 24.12 | 101,401 |

Aggregate throughput is flat (23.36 → 24.12, within noise) while per-request latency grew ~34% (75.4s → 101.4s). This confirms Run 1's plateau was real, not an artifact.

**Correctness spot check**: PASS. Sample output at concurrency 1 was valid, idiomatic TypeScript — correct Zod schemas, a sound generic `toolResultSchema<T>` factory, and a real Vitest assertion block. Minor style deviations from the ticket spec (interface vs. `type`, `source: z.string()` vs. a literal union) are exactly the class of thing orchestrator review catches per-ticket — not a Phase 0 concern.

## Thinking-mode tuning

`qwen3.8:27b` supports Ollama's `think` request flag. Two head-to-head tests against the concurrency-1 baseline (thinking on, 1,800 tokens / 77.0s for the schema+test task):

| task | think | tokens | wall time | correctness |
|---|---|---|---|---|
| schema + ToolResult wrapper + test | on (default) | 1,800 | 77.0s | correct |
| schema + ToolResult wrapper + test | off | 457 | 20.6s | correct, arguably cleaner (proper generic factory + `z.infer`) |
| `evaluateDiscount` boundary logic + 8 edge-case tests | off | 714 | 29.6s | correct on every boundary (inclusive 15, inclusive 25, negative, NaN) |

Disabling thinking gave a ~3.7x reduction in both tokens and wall time on the mechanical task, with no quality loss on either the mechanical task or a boundary-heavy logic task deliberately chosen to stress reasoning. This is two data points, not a rigorous study — but strong enough for a weekend build's pragmatic tuning pass.

**Decision: dispatch tickets with `think: false` by default.** If a specific ticket comes back from review with logic errors that look like a reasoning failure (not a spec-clarity failure), re-issue that one ticket with `think: true` before writing it off as a model capability problem.

## Conclusion / decision

**Dispatch tickets to Qwen sequentially (concurrency = 1), with `think: false`.** On this hardware, running more than one concurrent Qwen context buys no additional tickets/hour — the GPU's compute throughput is the bottleneck, not the number of parallel slots — while it does increase per-ticket latency and adds real operational risk (concurrent sessions touching the same git working tree, racing the in-memory idempotency store, etc.) for zero benefit. `OLLAMA_NUM_PARALLEL=5` is left at its existing value since it isn't the limiting factor and doesn't hurt single-stream performance. Disabling thinking mode compounds with this: fewer tokens per turn means each sequential ticket also completes faster, so the two decisions together (not concurrency) are the actual throughput win from Phase 0.

If a future ticket's context needs (tool schemas + accumulating trace) push meaningfully past what's been tested here, re-check tokens/sec at that longer context specifically — this has not yet been measured beyond a single short prompt at 32k context ceiling.

## Repository

Cloned from `fizzy2562/ConsultantCloud-Revenue-Agent` (was empty, zero commits, `main` branch). `PROJECT_SPEC.md` and this file plus `docs/tickets/` are the orchestrator's output for this phase — no application code has been written by Claude Code, and none will be.
