# Contributing

Issues and pull requests are welcome.

## Setup

You need Node 22+ and pnpm. The pnpm version is pinned in `package.json`, and `corepack enable`
picks it up.

```bash
pnpm install
pnpm -r build
pnpm -r test
cd evals && npx tsx runner.ts
```

CI runs those steps, plus `pnpm audit` and a gitleaks secrets scan.

To check the whole flow against a real Revenue Cloud org, run the app connected to one (with
the demo data set up, from the Connection tab) and then:

```bash
APP_URL=http://localhost:3000 TOOLS_API_KEY=<the app's key> pnpm test:org
```

It drives the chat and the tools API and checks the real outcomes in the org, such as a 30%
discount refused and a 20% one applied, with Salesforce showing the new net price. A pull request needs all of them
to pass.

## The rule to keep

The model decides what should happen; deterministic code decides whether it's allowed. Discount
thresholds, confirmation and idempotency live in `packages/policy` and `packages/agent-runtime`,
never in a prompt. A change that moves one of those decisions into a prompt won't be merged.

## Good first contributions

- New eval scenarios in `evals/cases/scenarios.ts`.
- Read tools that work on the demo data as well as on Salesforce.
- Docs: setting up an org, or running the agent with another model.

## Vendored packages

`packages/quickpick-core` and `packages/quickpick-salesforce-revenue` are vendored from
[revenue-picker](https://github.com/fizzy2562/revenue-picker); see each `VENDORED.md`. Make
changes there, then copy the update in.

Never commit `.env` files, tokens or org-specific IDs.
