import { MockRevenueGateway } from "@consultantcloud/shared";
import { runAgentTurn, type RunAgentTurnInput } from "@consultantcloud/agent-runtime";

export const runtime = "nodejs";

const gateway = new MockRevenueGateway();

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const input = body as { kind?: unknown };
  if (
    typeof input.kind !== "string" ||
    (input.kind !== "message" && input.kind !== "confirm" && input.kind !== "cancel")
  ) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const result = await runAgentTurn(input as unknown as RunAgentTurnInput, gateway);
    return Response.json(result);
  } catch (err) {
    console.error("Agent turn failed:", err);
    return Response.json(
      { error: "The agent is temporarily unavailable. Please try again." },
      { status: 500 }
    );
  }
}
