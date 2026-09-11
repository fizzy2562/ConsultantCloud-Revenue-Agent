# CPQ → Revenue Cloud Migration Report v2 — Build Report

## Summary

Replaced the single giant-prompt LLM call that generated the CPQ migration report with a
deterministic pipeline: a fixed Revenue Cloud mapping table, an explicit complexity/risk rubric,
and rules-based Markdown generation for the inventory and sequencing sections. The only remaining
LLM call is small and scoped — a per-script, 1–3-sentence plain-English summary of each Quote
Calculator Plugin's raw JavaScript, since that's the one genuinely unstructured/arbitrary input in
the whole pipeline.

New package: `packages/cpq-analysis/src/report/` (6 modules + `rcMappings.ts` data table).
Five of the six modules (all but `assembleReport.ts`) were drafted by `qwen3.8:27b` on `ai-box`
via `qwen.mjs`, one at a time (sequential — the Ollama backend on that box can only hold one model
loaded at once), then reviewed and, where needed, corrected here before being committed to the
local working tree. `assembleReport.ts` (the orchestrator) and the test suite were written
directly, since wiring the other five together required a correct simultaneous understanding of
all five real exported signatures — not something to hand to a non-agentic, single-shot model.

All builds and tests pass: `packages/cpq-analysis` (28 tests), `apps/web` (19 tests), and the full
workspace build (`pnpm build`) and test (`pnpm test`) across all 8 buildable workspace projects.

Nothing was committed to git, per instructions.

## Module-by-module

### 1. `rcMappings.ts` (Qwen-drafted)

Plain lookup table (`RC_MAPPINGS: Record<RcMappingCategory, RcMapping>`) mapping each of the 7 CPQ
categories to its Revenue Cloud target object(s) and a one-sentence migration mechanism, sourced
verbatim from `docs/cpq-to-revenue-cloud-migration-report.md` and the `TARGET_SCHEMA_GROUNDING`
string that used to live in the synthesize route.

**Issues found:** none. Qwen's first pass matched the brief exactly — no edits needed.

### 2. `buildInventorySection.ts` (Qwen-drafted, then corrected)

Pure function producing the "Object-by-object inventory" section: a summary GFM table plus a
`###` subsection per category (Price Rules, Discount Schedules, Product Rules split into
Product-/Quote-scoped, Custom Scripts, Catalog Structure, Twin Fields), each with real
names/IDs/counts pulled from the inspector data and the RC mapping mechanism from `rcMappings.ts`.
Handles `ok:false` per-inspector gracefully with a "_Inspector failed: ..._" note instead of
crashing.

**Issue found and fixed:** the summary table's catalog row labeled `Product2` as
`` `SBQQ__Product2__c` `` — factually wrong, since `Product2` is a standard Salesforce object, not
a managed/custom `SBQQ__`-namespaced one. Corrected to `` `Product2` `` in both the populated and
"no data" branches of `buildSummaryTable`.

### 3. `scoreComplexity.ts` (Qwen-drafted, then corrected — two real rubric bugs)

Pure function implementing the exact deterministic complexity/risk rubric (Custom Scripts, Twin
Fields, Product Rules per-rule/per-scope, Discount Schedules, Price Rules by average
conditions+actions, Catalog Structure), plus an overall-risk roll-up line naming the top 1-2
highest-risk items.

**Issues found and fixed:**
1. **Catalog Structure risk override bug.** The rubric says the `productOptions.length > 200` →
   risk `"Medium"` override is independent of which complexity branch applies. Qwen's draft only
   applied that override inside the "has attributes" (Medium-complexity) branch — a catalog with
   zero attribute-based configuration but a >200-option catalog was incorrectly scored risk
   `"Low"` instead of `"Medium"`. Fixed by computing `highOptionVolume` once, up front, and
   applying it to both complexity branches. Covered by a new test
   (`"bumps catalog structure risk to Medium when productOptions exceed 200, even with zero
   attributes"`) that would have failed against the original draft.
2. **Silent row-dropping on inspector failure.** Every other category (Custom Scripts, Twin
   Fields, Discount Schedules, Price Rules) falls back to an N/A row when its inspector result is
   `ok:false` or missing. Product Rules and Catalog Structure had no such fallback — an `ok:false`
   result for either silently produced *no row at all* for that category, inconsistent with the
   rest of the file and with the general "handle inspector failures gracefully" principle applied
   everywhere else in this codebase. Fixed by adding matching `else if (!result.ok)` branches that
   push an `N/A`/`N/A` row with the real error message as rationale.

### 4. `buildSequencingSection.ts` (Qwen-drafted, then corrected — one build-breaking bug)

Pure function producing the numbered "Sequencing recommendation" list in the fixed 8-step order
(catalog → discount schedules → twin fields → price rules → product-scoped rules → custom scripts
→ quote-scoped rules → UAT), skipping any step whose category is empty and renumbering
sequentially, with real counts spliced into each step's text.

**Issues found and fixed:**
1. **Build-breaking phantom import.** Line 1 was `import type { InspectorResult } from "./types";`
   — no such `./types` module was ever created (the brief explicitly said to define the type
   locally, matching the other report modules' convention). This would have failed
   `tsc` immediately. Replaced with the same local `InspectorResult` type declaration used in the
   sibling modules.
2. **Undercounted rule scoping.** `extractProductRulesByScope` only counted `scope === "Quote"`
   toward `quoteScoped`; a rule with a `null` or other non-`"Product"`/non-`"Quote"` scope value
   was counted in *neither* bucket, silently disappearing from both step 5's and step 7's counts
   (and potentially causing both steps to be skipped even though rules existed). Fixed so anything
   that isn't `scope === "Product"` counts as quote-scoped, matching the brief's explicit
   "more broadly, zero rules that aren't scope === 'Product'" guidance and `scoreComplexity`'s own
   grouping logic.
3. Also fixed a `noUncheckedIndexedAccess` compile error (`steps[i]` possibly `undefined`) at
   final-list-rendering time by switching to `steps.forEach` instead of an indexed loop — caught
   by `pnpm --filter @consultantcloud/cpq-analysis build`, not by the Qwen review pass.

### 5. `summarizeCustomScript.ts` (Qwen-drafted)

The one function in the whole module allowed to make a network call: a single scoped
chat-completions POST asking only for a 1–3-sentence plain-English description of a QCP script's
pricing logic, wrapped entirely in try/catch, falling back to
`` `Could not generate an automated summary; raw code preview: ${script.codePreview.slice(0, 150)}` ``
on any non-200 response, network error, or empty/missing content.

**Issues found:** none. Matched the brief exactly on first pass — correct request shape, correct
try/catch coverage, correct fallback string. Adopted verbatim.

### 6. `assembleReport.ts` (written directly, not via Qwen)

Top-level orchestrator. Calls the three pure section-builders, and — only when `llmConfig` is
supplied and custom scripts are present — calls `summarizeCustomScript` for every script in
parallel via `Promise.all` and appends the results as a
"Quote Calculator Plugin — AI-generated summaries" subsection alongside (not overwriting)
`buildInventorySection`'s raw-code-preview rendering. This keeps `assembleReport` decoupled from
`buildInventorySection`'s exact internal string formatting rather than doing fragile substring
splicing into its output.

`scriptSummaryFailed` is `true` whenever custom scripts exist and either no `llmConfig` was
supplied, the `Promise.all` rejected, or any individual script's summary came back as the
fallback string; it's `false` whenever there are no custom scripts at all (nothing to summarize)
or every summary call succeeded. The report itself is always produced — no code path throws.

## Tests

`packages/cpq-analysis/tests/report.test.ts` — 24 new tests, following this package's existing
`vi`/fixture-based mocking conventions (see `tests/inspectors.test.ts`):

- `scoreComplexity`: every rubric branch (Custom Scripts present/absent, Twin Fields
  present/absent, Product-scoped vs Quote-scoped Product Rules — explicitly asserting a
  quote-scoped rule scores `Medium`/`Medium-High` and *not* `Low`, Discount Schedules
  present/absent, Price Rules across the Low/Medium/High average-condition+action thresholds,
  Catalog Structure with/without attribute config, the >200-option risk-override bug fix, the
  overall-risk roll-up line, and `ok:false` graceful handling).
- `buildInventorySection`: asserts real fixture values (rule names, IDs, script names, field
  names) appear in the output and no placeholder text does; asserts RC mapping mechanisms appear;
  asserts an `ok:false` inspector produces a failure note, not a crash.
- `buildSequencingSection`: asserts the Discount Schedules step is skipped when absent, the Custom
  Scripts step is omitted entirely (not just empty) when there are no scripts and present when
  there are, catalog/UAT steps are always present even with an empty `raw`, and steps renumber
  sequentially (1, 2, 3, ...) regardless of which are skipped.
- `assembleReport`: full report generation with no `llmConfig` (`fetch` never called,
  `scriptSummaryFailed: true`), a successful mocked-`fetch` summary splice
  (`scriptSummaryFailed: false`, summary text present in the report), a rejected-`fetch` failure
  case and a non-200-response failure case (both falling back gracefully, both still producing the
  full report, both `scriptSummaryFailed: true`), and a no-custom-scripts case confirming `fetch`
  is never called and `scriptSummaryFailed` stays `false`.

## Build/test results

```
pnpm --filter @consultantcloud/cpq-analysis build   → tsc: clean, no errors
pnpm --filter @consultantcloud/cpq-analysis test    → 2 files, 28 tests, all passing
pnpm --filter @consultantcloud/web build            → next build: compiled successfully, typecheck clean
pnpm --filter @consultantcloud/web test             → 6 files, 19 tests, all passing
pnpm build   (repo root, all 8 buildable workspace projects) → all Done, no errors
pnpm test    (repo root, all 8 buildable workspace projects) → all Done, no failures
  - packages/policy:        24 tests passing
  - packages/cpq-analysis:  28 tests passing
  - packages/shared:        16 tests passing
  - packages/telemetry:      4 tests passing
  - packages/revenue-mcp:   22 tests passing
  - packages/agent-runtime: 26 tests passing
  - apps/web:                19 tests passing
```

No live Salesforce or LLM connection was used or needed for any of the above — everything was
verified with fixtures/mocks.

## Route changes — `apps/web/app/api/cpq-migration-report/synthesize/route.ts`

- Removed the ~90-line single giant-prompt implementation (the `TARGET_SCHEMA_GROUNDING` string,
  the catalog-summarization-for-prompt-size logic, the 290s `AbortController` timeout, the direct
  `fetch` to the LLM, and the `truncated`/`finish_reason` handling).
- Now calls `assembleReport(raw, llmConfig)` from `@consultantcloud/cpq-analysis`.
- Kept the exact same env var fallback pattern:
  `REPORT_LLM_API_URL ?? LLM_API_URL`, `REPORT_LLM_MODEL ?? LLM_MODEL`,
  `REPORT_LLM_API_KEY ?? LLM_API_KEY`.
- Behavior change per the module 6 spec: if no API key is configured (`REPORT_LLM_API_KEY`/
  `LLM_API_KEY` both unset), the route **no longer returns HTTP 503** — it now calls
  `assembleReport` with `llmConfig: undefined`, and the report is still produced in full (just
  without QCP AI summaries, using the raw code preview instead, with `scriptSummaryFailed: true`
  in the response so the UI can note it).
- Response shape changed from `{ report, truncated }` to `{ report, scriptSummaryFailed }`.
- `maxDuration` lowered from `300` to `60` (with headroom — the deterministic sections are
  near-instant; the only real latency is the small per-script LLM calls, expected to be low tens
  of seconds even for several scripts run in parallel).

## Modal changes — `apps/web/components/CpqMigrationReportModal.tsx`

- `SynthesizeResponse` type: `truncated?: unknown` → `scriptSummaryFailed?: unknown`; component
  state renamed to match (`truncated`/`setTruncated` → `scriptSummaryFailed`/
  `setScriptSummaryFailed`).
- `SYNTHESIZE_STEPS` rewritten from 8 entries (describing the old single-prompt reasoning process)
  down to 4, reflecting what the pipeline actually does now (mapping to RC objects, applying the
  rubric, summarizing scripts, drafting sequencing); rotation interval for the synthesizing spinner
  shortened from the default 3500ms to 700ms, since the whole step now typically completes in a
  few seconds rather than minutes.
- "Generating the report — this can take a few minutes..." → "Assembling the report — this only
  takes a few seconds...".
- The warning banner (still using the pre-existing `cc-migration-truncated-warning` CSS class —
  intentionally left as-is since it's purely a class name and `globals.css` has unrelated
  pre-existing uncommitted changes that were left untouched) now describes a QCP-summary failure
  rather than an output-length truncation, and its "Try Again" button is gated on
  `scriptSummaryFailed` instead of `truncated`.
- No other structural changes — the rotating-status-message / cloud-spinner UI pattern, the
  idle/querying/synthesizing/done/error state machine, and the raw-data/copy/markdown-render
  actions are all unchanged.

## `packages/cpq-analysis/src/index.ts`

Added exports for the new `report/` modules. **Not** done via a blanket `export * from
"./report/..."` for every module, because `buildInventorySection.ts`, `scoreComplexity.ts`, and
`buildSequencingSection.ts` each independently declare their own local `InspectorResult` type
(structurally identical, but distinct declarations) — wildcard-exporting all three from the same
barrel file triggers TS2308 ("already exported a member named..."). Used explicit named
re-exports instead, exposing `InspectorResult` once (from `buildInventorySection`), plus
`RC_MAPPINGS`/`RcMapping`/`RcMappingCategory`, `buildInventorySection`, `scoreComplexity`,
`buildSequencingSection`, `summarizeCustomScript`, `assembleReport`, `LlmConfig`, and
`AssembleReportResult`.

## Ai-box artifacts (for pull-back / reference)

Everything below lives on the `ai-box` SSH host under `C:\Users\sshadmin\cc-cpq-report-v2\`:

- `packages\cpq-analysis\src\report\rcMappings.ts` — Qwen's original output, adopted verbatim
  (identical to what's now in the local repo).
- `packages\cpq-analysis\src\report\buildInventorySection.ts` — Qwen's original output *before*
  the `Product2` table-label fix described above (the local repo copy is corrected).
- `packages\cpq-analysis\src\report\scoreComplexity.ts` — Qwen's original output *before* the two
  rubric-bug fixes described above (the local repo copy is corrected).
- `packages\cpq-analysis\src\report\buildSequencingSection.ts` — Qwen's original output *before*
  the phantom-import and scope-undercounting fixes described above (the local repo copy is
  corrected).
- `packages\cpq-analysis\src\report\summarizeCustomScript.ts` — Qwen's original output, adopted
  verbatim (identical to what's now in the local repo).
- `01-rcMappings.md` … `05-summarizeCustomScript.md` — the five task briefs sent to `qwen.mjs`, for
  reference/reuse if this pipeline needs another pass.
- The rest of the tree is the packaged repo snapshot (tar-extracted) used as `qwen.mjs`'s working
  directory; it does **not** contain `assembleReport.ts`, the test suite, the route/modal changes,
  or this report — those exist only in the local repo (they were written directly here, not
  dispatched to ai-box).

The **authoritative, corrected, fully tested** versions of every file are in this local repo at:

- `packages/cpq-analysis/src/report/rcMappings.ts`
- `packages/cpq-analysis/src/report/buildInventorySection.ts`
- `packages/cpq-analysis/src/report/scoreComplexity.ts`
- `packages/cpq-analysis/src/report/buildSequencingSection.ts`
- `packages/cpq-analysis/src/report/summarizeCustomScript.ts`
- `packages/cpq-analysis/src/report/assembleReport.ts`
- `packages/cpq-analysis/src/index.ts`
- `packages/cpq-analysis/tests/report.test.ts`
- `apps/web/app/api/cpq-migration-report/synthesize/route.ts`
- `apps/web/components/CpqMigrationReportModal.tsx`
