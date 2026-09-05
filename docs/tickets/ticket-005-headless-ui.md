# Ticket 005 — Headless UI against mocked tool responses

Status: DONE
Depends on: ticket-001 (shared types), ticket-003/004 (tool response shapes to mock against — but this ticket does NOT call the real MCP server; it mocks tool responses directly in the UI layer for independent development)

## Review notes

Built as a real Next.js 16 / React 19 app (App Router), not a static mockup — `next build` succeeds, producing an actual static-optimized production build. Four canned conversation flows implemented (one per starter prompt, exceeding the ticket's "at least 3") — Qwen matched the exact required starter-prompt wording and confirmation-card content precisely, and correctly set `confirmation: null` for the 30% rejection flow without being reminded twice.

The hard requirement ("confirmation must never be buried in chat text") is proven with an automated test, not just eyeballed: `ChatApp.test.tsx` uses React Testing Library to assert `getByRole("alert")` exists for the renewal flow and is completely absent (`queryByRole("alert")` is `null`) for the 30% rejection flow.

Placeholder logo asset (`consultantcloud-logo.svg`) is a simple generated cloud mark using the two brand colors — the real supplied asset from PROJECT_SPEC.md doesn't exist in this repo; flagging per the ticket's own instruction rather than inventing something that could be mistaken for a final brand asset.

Two infrastructure issues found and fixed directly (not Qwen defects — both are test-harness configuration, not component logic): a stray `.cc-trace-blocked` CSS class the trace panel used but the stylesheet brief hadn't defined (added one rule); and `vitest.config.ts` needed `globals: true` for React Testing Library's automatic per-test DOM cleanup to register — without it, sequential tests accumulated DOM nodes from prior renders and produced false "multiple elements found" failures.

**Update: actually driven in a real browser (chrome-devtools MCP tools), not just unit-tested — and this surfaced three real bugs the automated tests couldn't see, all now fixed:**

1. **Trace panel rendered in the wrong place entirely.** `ToolTracePanel` returned a React Fragment with the toggle button and the `.cc-trace-panel` div as sibling top-level elements. Since it was placed directly inside `.cc-app-shell` (a 2-column CSS Grid), the Fragment's two children became two separate grid items instead of one: the button landed alone in column 2, and the actual trace entries wrapped to a new row spanning column 1's width — rendering full-width below everything else instead of in the right column. Screenshot evidence before/after in `docs/screenshots/02-renewal-confirmation.png`. Fixed by wrapping both in one containing `<div className="cc-trace-panel">`, making it a single grid item.
2. **Header text ran together with no spacing** ("OPEN SOURCE LABGitHubBuilt for Agentforce Revenue Management" as one visual run) because the two header `<div>`s had no `gap`. Fixed with flexbox gap, plus `flex-wrap` and a mobile-width media query so it degrades to a clean stacked layout instead of cramming into a narrow column.
3. **Mobile "collapsed" trace panel wasn't actually collapsed** — it still rendered as a large empty background block instead of just the toggle button, because collapsing only hid the entries, not the panel container itself, which had no height constraint. Fixed with `max-height: 64px` on `.cc-trace-panel--collapsed`, overridden back to unconstrained on desktop where the panel should never collapse.

All three are genuine layout defects that `ChatApp.test.tsx`'s DOM-presence assertions (via jsdom, which doesn't compute real CSS Grid layout) had no way to catch — this is exactly why the instruction to test UI changes in an actual browser before calling them done exists. Verified visually at both desktop (1440px) and mobile (390px) viewports after the fixes; screenshots in `docs/screenshots/`.

Verified: `next build` succeeds (static generation of `/`), `pnpm --filter web test` 3/3 passing, full workspace 34 tests passing, and now also real-browser-verified across all four demo flows at two viewport widths.

## Goal

The ConsultantCloud-branded chat + trace UI, built entirely against hardcoded/mocked tool-call responses shaped like real `ToolResult<T>` payloads. This ticket does not wire up a real agent loop or a real MCP client — that integration happens later. The goal here is pixel/interaction-complete UI that the real wiring drops into.

## Files you may create or touch

```
apps/web/app/**
apps/web/components/**
apps/web/lib/mockConversation.ts
apps/web/public/consultantcloud-logo.svg      (placeholder acceptable if brand asset not yet supplied — flag this in your PR, don't invent a logo)
apps/web/styles/brand-tokens.css
apps/web/package.json
```

Do not touch `packages/`.

## Brand (PROJECT_SPEC.md Section 9)

- Blue `#3d7fab`, green `#51ac52` — primary gradient.
- Header: ConsultantCloud logo + "consultantcloud" (left); "OPEN SOURCE LAB", GitHub link, "Built for Agentforce Revenue Management" (right).
- Hero: "Revenue work, without the paperwork." / subheading: "A headless Agentforce demo that turns plain-English commercial requests into governed Revenue Management actions." / badge: "ConsultantCloud Labs · Open Source".
- Layout: desktop 65% conversation / 35% live execution trace, side by side. Mobile: conversation first, trace collapsible.
- Starter prompts (exact text from spec):
  - "Renew Acme University for 3 years and increase Cloud Pro to 250 seats."
  - "Create an initial quote for Greenfield Health with 75 Cloud Pro seats."
  - "Give Acme University a 20% discount."
  - "Try to give Acme University a 30% discount."

## Tool trace panel

Each entry shows: tool name, status, duration, read/write badge, request ID, compact request summary, compact result summary. Match the visual pattern in PROJECT_SPEC.md Section 9 (checkmark/gate icons, monospace-ish trace feel) — exact pixels are your call, but the information density and the READ/WRITE/GATE distinction must be visually obvious at a glance, not just present in a tooltip.

## Confirmation component — the most important piece of this ticket

For protected actions, a **very obvious, non-dismissible-by-accident** confirmation card (Section 9):

> **Ready to create renewal quote**
> Account: Acme University
> Term: 36 months
> Cloud Pro: 250 seats
> Discount: 12%
>
> [Create renewal] [Cancel]

Hard requirement carried over from PROJECT_SPEC.md Section 9: **confirmation must never be buried inside chat text.** It must be its own visually distinct component, not a sentence like "Type 'yes' to confirm" inline in the conversation. This will be checked during review by looking at the rendered component tree, not just the copy.

## Mock conversation data

Build `apps/web/lib/mockConversation.ts` with at least 3 canned conversation flows matching the demo script (PROJECT_SPEC.md Section 17):
1. Happy-path renewal with confirmation, ending in success.
2. 30% discount request -> deterministic rejection (no confirmation card — this path never reaches confirmation because policy rejects before that point).
3. 20% discount request -> approval-required confirmation card shown.

These mocks let anyone run `pnpm --filter web dev` and click through all three flows with zero backend running.

## What this ticket must never do

- Never render a confirmation as plain chat text, a native `window.confirm`, or anything a user could miss by skimming.
- Never fabricate additional starter prompts or UI copy beyond what's in Section 9 without flagging it as an addition in your PR description.
- Never hardcode real-looking Salesforce IDs in UI copy that could be mistaken for real data if someone screenshots it later without context — use the same fixture IDs as `packages/shared`'s mock data where you need an ID to display.

## Acceptance criteria

1. `pnpm --filter web build` succeeds.
2. `pnpm --filter web dev` serves a page where all 4 starter prompts are clickable and each of the 3 canned flows above renders correctly, including the confirmation card appearing as its own component (not chat text) for flows 1 and 3, and the rejection for flow 2 rendering without any confirmation card at all.
3. Responsive check: at a mobile viewport width, trace panel is collapsed/hidden by default with a way to expand it; conversation is full-width.
4. No secrets, tokens, or real org URLs anywhere in this ticket's code — it's mock-only.

## Out of scope

- Real MCP client wiring / real agent loop (separate integration ticket, later)
- Execution trace event schema and logger (ticket-006 — this ticket only renders trace data it's handed, it doesn't produce it)
