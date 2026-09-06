# Ticket 024 — Docker image

Status: DONE

## What this covers

The project had no packaged deployment artifact — a real gap the project's own spec calls out explicitly (PROJECT_SPEC.md, P2 scope: "Docker image and public registry"; this ticket covers the image, not publishing to a public registry, which is an external distribution action outside this repo's scope). Added a multi-stage `Dockerfile` at the repository root that builds the whole pnpm workspace and produces a minimal, non-root, standalone Next.js server image for `apps/web`.

While scoping this, found and fixed a real latent bug: the live agent chat (`apps/web/app/api/chat/route.ts`) never passed `agent-runtime`'s existing `ollamaUrl` option through, so it always used the hardcoded `http://127.0.0.1:11434` default — harmless on a bare-metal dev machine, but silently broken inside any container, since the container can't reach the host machine's Ollama at that address. Added an `OLLAMA_URL` environment variable that's passed through only when set, preserving the existing default behavior otherwise.

Also enabled Next.js `output: "standalone"` in `apps/web/next.config.mjs`, which makes `next build` trace the actual runtime dependency graph across the whole pnpm workspace and emit a pruned, self-contained server bundle — the thing the Dockerfile's final stage actually copies into the runtime image.

Dispatched as a single ticket to **codex** on ai-box, which has both Docker Desktop and the project's Ollama instance already running — letting this ticket be verified with a real, live, end-to-end `docker build`/`docker run` cycle rather than an untested Dockerfile, matching the verification discipline established throughout this project.

## What the orchestrator fixed during merge

Nothing — the diff matched the ticket's spec, and codex had already iterated on the Dockerfile's `COPY`/`CMD` paths itself (as instructed) until a real container actually served real traffic, rather than guessing at Next.js's standalone monorepo output layout. Build and tests passed immediately on merge.

## Verification

This ticket carries unusually strong verification evidence because codex was instructed not to stop at `docker build` exiting 0, but to prove a running container actually serves correctly:

- Full workspace `pnpm -r build`/`pnpm -r test`: 77/77 tests passing, no regressions, confirmed independently by the orchestrator after merge (not just trusted from the dispatch's own report).
- Real `docker build -t consultantcloud-revenue-agent .` from the repo root completed successfully (final image digest `sha256:418d83d7e02b09e2efaf50c7b3755d740ad45e57572f8156f4c6ab01cf3e5c9e`); an uncached rebuild was also run to confirm the full pipeline (`pnpm install --frozen-lockfile` → `pnpm -r build` → runner `COPY`s) works from scratch, not just from Docker's build cache.
- A real running container (`docker run -d -p 3000:3000 -e TOOLS_API_KEY=test-local-key`) served real HTTP traffic: the homepage returned actual app HTML, a static CSS chunk resolved correctly (proving the standalone build's static-asset copy path is correct — the most common way this kind of Dockerfile silently breaks), and an authenticated `/api/tools/find_account` call returned real seeded Acme University data.
- A second container, started with `OLLAMA_URL=http://host.docker.internal:11434`, made a real chat request that reached the host's actual Ollama instance, got a real model response back, executed the seeded `find_account` tool, and returned a coherent final agent message — proving the `OLLAMA_URL` fix works end to end inside a real container, not just that it compiles.
- All verification containers were stopped and removed; no leftover `cc-*` containers or dangling test state remain on ai-box.
- One honestly-reported hiccup along the way: Docker Desktop was initially stopped, and its default credential store then failed while pulling the public base image; both were worked around (starting Docker Desktop, then using an isolated, empty `DOCKER_CONFIG` directory for the build) without modifying the user's actual Docker configuration.

## What's left

Nothing code-side. Publishing the image to a public registry (the other half of the original P2 spec line) is a deliberate external-distribution action outside this ticket's and this repo's scope, and hasn't been done.
