# Ticket 006 — Execution trace / observability

Status: NOT_STARTED
Depends on: ticket-001 (shared types)

## Goal

The event schema, structured logger, and metrics rollup from PROJECT_SPEC.md Section 11. This produces the data ticket-005's trace panel renders — build it independent of the UI (UI mocks its own data for ticket-005; this ticket doesn't need a UI to be complete).

## Files you may create or touch

```
packages/shared/schemas/event.ts        (event schema lives in shared since both MCP and UI will eventually import it)
packages/telemetry/package.json
packages/telemetry/tsconfig.json
packages/telemetry/src/logger.ts
packages/telemetry/src/metrics.ts
packages/telemetry/tests/*.test.ts
```

## Event schema (Section 11 minimum fields)

Every tool-call event must carry:
- unique request ID
- unique conversation/run ID
- tool name
- tool latency (ms)
- result status (success / policy-blocked / error)
- policy decision (if applicable — permitted / approval_required / rejected / n/a)
- human confirmation event (if applicable — confirmed / declined / n/a)
- Salesforce request status (if applicable — this demo phase will mostly be "mock", real values come in Phase 3)

Define this as a Zod schema (`ToolCallEvent`) so it can be validated the same way tool inputs/outputs are.

## Logger

- Structured JSON logs, one line per event, written via a pluggable sink (default: local file or SQLite per Section 11 — your choice, document which in the package README, but keep it swappable behind an interface since a later ticket may want to point this at `Agent_Tool_Call__c` in Salesforce).
- **Never log secrets, OAuth tokens, or raw credentials** (Section 11, explicit). Add a redaction test: construct an event containing something that looks like a token/secret in a field that shouldn't have one, and assert the logger either rejects it or the schema doesn't have a field capable of carrying it — the point is the schema itself shouldn't have an "arbitrary blob" field that could leak secrets, not that you bolt on string-matching redaction as an afterthought.

## Metrics rollup

Compute, from a set of logged events:
- successful task rate
- average tool latency
- tool failure count
- policy block count
- human confirmation count
- end-to-end duration (first event to last event in a conversation/run ID)

Export a `computeMetrics(events: ToolCallEvent[]): MetricsSummary` pure function — no I/O, so it's trivially testable and reusable by both a CLI summary and a future dashboard.

## What this ticket must never do

- Never let the event schema include a free-form field that could carry a secret or credential (see redaction note above).
- Never silently drop failed/blocked events from metrics — a policy block or failure must be visible in the rollup, not filtered out because it's not a "success."

## Acceptance criteria

1. `pnpm --filter telemetry test` passes, covering at minimum:
   - Logging a valid event round-trips through the schema.
   - `computeMetrics` on a fixture set of ~10 events (mix of success, policy-blocked, failed) produces correct counts for every field listed above — write the fixture events by hand so the expected numbers are known, not derived.
   - The redaction/schema test described above.
2. No `any` types, no free-form untyped metadata blobs on the event schema.

## Out of scope

- The actual UI trace panel (ticket-005 — this ticket only produces data, doesn't render it)
- Dashboards beyond the `computeMetrics` summary function
- Persisting to `Agent_Execution__c` / `Agent_Tool_Call__c` in Salesforce (Phase 3 — this ticket's sink can be a local file/SQLite stand-in)
