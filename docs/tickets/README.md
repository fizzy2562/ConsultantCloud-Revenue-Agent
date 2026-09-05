# Ticket workflow

Tickets in this directory are the only interface between the orchestrator (Claude Code) and the implementer (Qwen 3.8 via Ollama on `ai-box`).

## Rules

- Claude Code writes and reviews tickets. It does not edit files under `apps/`, `packages/`, `salesforce/`, or `evals/`.
- Qwen is the sole author of source code for those directories, and commits its own work.
- Every ticket is self-contained: goal, exact files it may touch, the interface/schema it must conform to, explicit acceptance tests, and what it must never invent (see `PROJECT_SPEC.md` Section 6).
- A ticket is "done" when its acceptance criteria pass under `pnpm build/test/lint` (or the eval runner, once it exists) — not by inspection alone.

## Failure / retry policy

- Failed review -> orchestrator writes a defect list appended to the same ticket file under a `## Defects (round N)` heading, and re-issues it to Qwen.
- **Cap: 3 rounds per ticket.** If a ticket fails review after 3 attempts, stop re-issuing it. Escalate to the user with the ticket, the 3 defect rounds, and a recommendation (split the ticket, change the approach, or hand-fix) rather than looping indefinitely.
- A defect list must cite the specific guardrail or acceptance criterion that failed, not general code quality.

## Status values

Each ticket file's front line after the title is a status: `NOT_STARTED`, `IN_PROGRESS`, `IN_REVIEW`, `DEFECTS_ROUND_n`, `DONE`, `ESCALATED`.

## Scheduling model: pipelined, not concurrent

Phase 0 (`docs/architecture.md`) measured this hardware as compute-bound: running two Qwen sessions at once does not finish two tickets faster than running them back-to-back — it just splits the same ~23-24 tok/s ceiling and adds a measured ~30-40% per-job latency tax, plus real risk of two sessions corrupting the same git working tree. So **only one Qwen generation runs at a time.**

The actual waste to eliminate isn't GPU idle time between concurrent jobs — it's GPU idle time while the orchestrator is reviewing. Qwen finishing a ticket and then sitting idle for however long `pnpm build/test/lint` + acceptance-criteria review takes is dead time the box doesn't need to sit through.

**Rule: as soon as a ticket is handed off for review, dispatch is allowed to begin on the next ticket whose dependencies are already satisfied — never on a ticket still waiting on the one under review.** Review of ticket N and generation of ticket N+1 can overlap; two generations never overlap.

Current dependency graph (from the tickets as written):

```
001 (shared contracts)
 ├─ 002 (policy engine)        depends on 001
 ├─ 003 (MCP read tools)       depends on 001
 ├─ 005 (headless UI)          depends on 001 (mocks its own data — doesn't need 003/004 done)
 └─ 006 (execution trace)      depends on 001
      004 (MCP mutation tools) depends on 001 + 002 + 003
```

So the dispatch order that keeps the box busy: **001 → (while 001 is in review, nothing — everything else depends on it) → 002, 003, 005, 006 in any order (while each is in review, dispatch the next of that group) → 004 last**, since it's the only one that needs 002 and 003 both merged first.

If a ticket comes back with defects, its re-issue re-enters the queue at the same priority — it does not block dispatch of other already-unblocked tickets, but a ticket that depends on it stays blocked until it's DONE.

## Isolation

Even single-threaded, Qwen commits its own work as it finishes each ticket — no long-lived uncommitted state should span a review cycle. If crash/stall isolation across tickets is ever wanted badly enough to accept the latency tax (e.g. one ticket is stuck in a defect loop and you want a second one to proceed at the same time regardless of cost), that's a documented opt-in, not the default: use a separate `git worktree` per concurrent ticket so simultaneous sessions can't corrupt each other's working tree, and expect each to run ~30-40% slower than it would running alone.
