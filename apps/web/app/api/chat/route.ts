import { createRevenueGateway } from "@consultantcloud/revenue-mcp";
import { envCredentialsAllowed, readSalesforceSession } from "../../../lib/salesforceSession";
import { LlmApiError, runAgentTurn, type RunAgentTurnInput } from "@consultantcloud/agent-runtime";

export const runtime = "nodejs";


export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const input = body as { kind?: unknown; conversationId?: unknown; mode?: unknown; history?: unknown };
  if (
    typeof input.conversationId !== "string" ||
    typeof input.kind !== "string" ||
    !Array.isArray(input.history) ||
    (input.kind !== "message" && input.kind !== "confirm" && input.kind !== "cancel") ||
    (input.mode !== undefined && input.mode !== "user" && input.mode !== "architect")
  ) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  // A visitor's own key ("bring your own key", from the Connection tab) wins over the
  // deployment's. It is only ever sent to the configured LLM_API_URL, and never stored or logged.
  const ownKey = request.headers.get("x-llm-api-key")?.trim() || undefined;
  const ownModel = request.headers.get("x-llm-model")?.trim() || undefined;
  if (ownKey && !/^[\x21-\x7e]{20,300}$/.test(ownKey)) {
    return Response.json({ error: "That API key doesn't look right. Check it on the Connection tab." }, { status: 400 });
  }
  if (ownModel && !/^[\w.:\/-]{3,120}$/.test(ownModel)) {
    return Response.json({ error: "That model name doesn't look right. Check it on the Connection tab." }, { status: 400 });
  }
  const apiKey = ownKey ?? process.env.LLM_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "No AI model is configured. Add your own OpenRouter key on the Connection tab, or set LLM_API_KEY in apps/web/.env (see the README) and restart the app." },
      { status: 503 }
    );
  }
  // With their own key a visitor gets the model they chose, or the runtime's default; the
  // deployment's LLM_MODEL (often a free model on a public demo) applies to its own key only.
  const model = ownKey ? ownModel : process.env.LLM_MODEL;

  try {
    // Per request: the signed-in user's session, else the deployment's env token where allowed,
    // else the demo data.
    const gateway = createRevenueGateway((await readSalesforceSession()) ?? undefined, {
      useEnvironment: envCredentialsAllowed(),
    });
    const result = await runAgentTurn({ ...(input as unknown as RunAgentTurnInput), mode: input.mode === "architect" ? "architect" : "user" }, gateway, {
      runId: input.conversationId,
      apiKey,
      ...(process.env.LLM_API_URL ? { apiUrl: process.env.LLM_API_URL } : {}),
      ...(model ? { model } : {}),
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof LlmApiError) {
      const explained = explainModelError(err.status, Boolean(ownKey));
      if (explained) return Response.json({ error: explained }, { status: 503 });
    }
    console.error("Agent turn failed:", err);
    return Response.json(
      { error: "The agent is temporarily unavailable. Please try again." },
      { status: 500 }
    );
  }
}

/** Model API failures a person can do something about, in words they can act on. */
function explainModelError(status: number, ownKey: boolean): string | null {
  if (ownKey) {
    if (status === 401 || status === 403) return "Your API key was rejected. Check it on the Connection tab, or remove it to use the demo's free model.";
    if (status === 402) return "Your OpenRouter account is out of credits. Top it up, or remove your key on the Connection tab to use the demo's free model.";
    if (status === 429) return "Your key is being rate-limited by the model provider. Wait a minute and try again.";
    if (status === 400 || status === 404) return "The model you chose wasn't accepted. Check its name on the Connection tab, or leave it blank for the default.";
    return null;
  }
  if (status === 429 || status === 402) {
    return "The demo's free model has hit its limit for now (free models are capped per minute and per day). Add your own OpenRouter key on the Connection tab to keep going, or try again later.";
  }
  return null;
}
