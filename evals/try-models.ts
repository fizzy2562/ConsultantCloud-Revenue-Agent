/**
 * Which models can run this agent? Runs the demo's User-mode scenarios through the real agent
 * runtime on the built-in demo data, once per model, and prints what each one did.
 *
 *   LLM_API_KEY=<openrouter key> pnpm --filter @consultantcloud/evals try-models
 *   LLM_API_KEY=... pnpm --filter @consultantcloud/evals try-models -- some/model:free other/model
 *
 * Free models cost nothing but are rate-limited, so a 429 here is a limit, not a failed model.
 */
import { MockRevenueGateway } from "@consultantcloud/shared";
import { LlmApiError, runAgentTurn, type AgentTurnResult, type ChatTurn } from "@consultantcloud/agent-runtime";

const DEFAULT_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "google/gemma-4-31b-it:free",
  "deepseek/deepseek-v4-flash-0731",
];

type Outcome = { ok: boolean; note: string; seconds: number };

async function step(model: string, history: ChatTurn[], text: string, gateway: MockRevenueGateway, runId: string) {
  const result = await runAgentTurn({ kind: "message", text, history }, gateway, { model, runId });
  history.push({ role: "user", content: text }, { role: "assistant", content: result.message });
  return result;
}

async function confirm(model: string, history: ChatTurn[], previous: AgentTurnResult, gateway: MockRevenueGateway, runId: string, approverName?: string) {
  return runAgentTurn({ kind: "confirm", pending: previous.pendingConfirmation!, history, ...(approverName ? { approverName } : {}) }, gateway, { model, runId });
}

const scenarios: Record<string, (model: string) => Promise<Omit<Outcome, "seconds">>> = {
  async renewal(model) {
    const gateway = new MockRevenueGateway();
    const result = await step(model, [], "Renew Acme University for 3 years and increase Cloud Pro to 250 seats.", gateway, `try-${model}-renewal`);
    const tool = result.pendingConfirmation?.toolName;
    return tool === "create_renewal_quote"
      ? { ok: true, note: "proposed create_renewal_quote for confirmation" }
      : { ok: false, note: `no renewal proposed: ${tool ?? result.message.slice(0, 90)}` };
  },
  async "30% refused"(model) {
    const gateway = new MockRevenueGateway();
    const runId = `try-${model}-30`;
    const proposed = await step(model, [], "Apply a 30% discount to Acme University's Cloud Pro line on quote Q-10000.", gateway, runId);
    if (proposed.pendingConfirmation?.toolName !== "apply_discount") return { ok: false, note: `no discount proposed: ${proposed.message.slice(0, 90)}` };
    const done = await confirm(model, [], proposed, gateway, runId);
    return done.trace.some((t) => t.blocked) ? { ok: true, note: "policy blocked the 30% discount" } : { ok: false, note: "30% was not blocked" };
  },
  async "20% needs approver"(model) {
    const gateway = new MockRevenueGateway();
    const runId = `try-${model}-20`;
    const proposed = await step(model, [], "Apply a 20% discount to Acme University's Cloud Pro line on quote Q-10000.", gateway, runId);
    if (proposed.pendingConfirmation?.toolName !== "apply_discount") return { ok: false, note: `no discount proposed: ${proposed.message.slice(0, 90)}` };
    if (!proposed.pendingConfirmation.summary.requiresApproverName) return { ok: false, note: "no approver requested" };
    const done = await confirm(model, [], proposed, gateway, runId, "Dana Whitfield");
    const last = done.trace[done.trace.length - 1];
    return last && !last.blocked ? { ok: true, note: "asked for an approver, then applied" } : { ok: false, note: "not applied with an approver" };
  },
};

async function main() {
  if (!process.env.LLM_API_KEY) {
    console.error("Set LLM_API_KEY (an OpenRouter key) first.");
    process.exit(1);
  }
  const models = process.argv.slice(2).filter((a) => a !== "--");
  const rows: string[] = [];
  for (const model of models.length ? models : DEFAULT_MODELS) {
    console.log(`\n${model}`);
    let passed = 0;
    let seconds = 0;
    for (const [name, run] of Object.entries(scenarios)) {
      const start = Date.now();
      let outcome: Omit<Outcome, "seconds">;
      try {
        outcome = await run(model);
      } catch (error) {
        const limited = error instanceof LlmApiError && (error.status === 429 || error.status === 402);
        outcome = { ok: false, note: limited ? "rate-limited (try again later)" : (error as Error).message.slice(0, 100) };
      }
      const took = (Date.now() - start) / 1000;
      seconds += took;
      if (outcome.ok) passed += 1;
      console.log(`  ${outcome.ok ? "PASS" : "FAIL"}  ${name.padEnd(20)} ${took.toFixed(1).padStart(5)}s  ${outcome.note}`);
    }
    rows.push(`${model.padEnd(45)} ${passed}/${Object.keys(scenarios).length}   ${seconds.toFixed(0)}s`);
  }
  console.log(`\nModel                                         Passed  Time\n${rows.join("\n")}`);
}

main();
