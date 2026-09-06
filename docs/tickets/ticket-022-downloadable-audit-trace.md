# Ticket 022 — Downloadable audit trace

Status: DONE

## What this covers

Every MCP tool call was already logged as a structured `ToolCallEvent` to a local JSONL file (`packages/telemetry`'s `EventLogger`/`FileEventSink`), tagged with the conversation's `runId`, and the web UI already showed a live, in-memory trace panel for the current browser session — but there was no way to get a durable, downloadable copy of a conversation's full audit trail. This is a real observability gap the project's own spec calls out explicitly (PROJECT_SPEC.md, P1 scope: "downloadable audit trace").

Added:

- `apps/web/app/api/runs/[runId]/trace/route.ts` — a `GET` route that reads `revenue-mcp-events.jsonl` from the process working directory, filters to events matching the `runId` route param (skipping blank/malformed lines rather than erroring), and returns them as a pretty-printed JSON array with `Content-Disposition: attachment` so the browser downloads it directly. Missing file or no matching events both return an empty array with 200, not an error.
- A "Download trace" link in `apps/web/components/ToolTracePanel.tsx`, next to the existing "Show/Hide trace" toggle, wired to the chat UI's existing `conversationId` (now threaded through as a `runId` prop from `ChatApp.tsx`).
- 3 new route tests covering matching events, no matches, and a missing event file, using real temporary fixture files cleaned up per test.

Dispatched to **codex**, scoped to files entirely within `apps/web`, disjoint from ticket-021's core dispatch running in parallel.

## What the orchestrator fixed during merge

Nothing — this ticket's scope was fully self-contained within `apps/web` and didn't intersect any other in-flight ticket. Build and tests passed immediately on merge with no gaps to close.

## Verification

- Full workspace `pnpm -r build`/`pnpm -r test`: passed cleanly on first merge (67/67 tests at the time, before ticket-021 added 4 more).
- Live end-to-end verification against the actual running dev server, beyond the unit tests: requested a trace for an unused run ID before any events existed → `200` with `[]` and the correct `Content-Disposition` header; called the real REST bridge's `find_account` tool to generate one genuine logged event; downloaded that event's `runId` and got back exactly that one event, correctly shaped, with the download header naming the file after the run ID.

## What's left

Nothing code-side. The route reads the same `./revenue-mcp-events.jsonl` file every part of this app already writes to relative to its own process working directory — a pre-existing, unchanged detail of how `packages/revenue-mcp`'s `createServer` wires up its `FileEventSink`, not something this ticket altered.
