import { createRevenueGateway } from "@consultantcloud/revenue-mcp";
import { envCredentialsAllowed, readSalesforceSession } from "../../../lib/salesforceSession";
import { runAgentTurn, type RunAgentTurnInput } from "@consultantcloud/agent-runtime";

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

  if (!process.env.LLM_API_KEY) {
    return Response.json(
      { error: "No AI model is configured. Set LLM_API_KEY in apps/web/.env (an OpenRouter key works; see the README), then restart the app." },
      { status: 503 }
    );
  }

  try {
    // Per request: the signed-in user's session, else the deployment's env token where allowed,
    // else the demo data.
    const gateway = createRevenueGateway((await readSalesforceSession()) ?? undefined, {
      useEnvironment: envCredentialsAllowed(),
    });
    const result = await runAgentTurn({ ...(input as unknown as RunAgentTurnInput), mode: input.mode === "architect" ? "architect" : "user" }, gateway, {
      runId: input.conversationId,
      ...(process.env.LLM_API_KEY ? { apiKey: process.env.LLM_API_KEY } : {}),
      ...(process.env.LLM_API_URL ? { apiUrl: process.env.LLM_API_URL } : {}),
      ...(process.env.LLM_MODEL ? { model: process.env.LLM_MODEL } : {}),
    });
    return Response.json(result);
  } catch (err) {
    console.error("Agent turn failed:", err);
    return Response.json(
      { error: "The agent is temporarily unavailable. Please try again." },
      { status: 500 }
    );
  }
}
