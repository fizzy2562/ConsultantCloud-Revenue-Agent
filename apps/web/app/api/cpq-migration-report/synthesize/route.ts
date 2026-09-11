import { assembleReport, type InspectorResult } from "@consultantcloud/cpq-analysis";

export const runtime = "nodejs";
// The report is assembled entirely deterministically (rules-based inventory, complexity/risk
// scoring, sequencing, and every other section) -- no LLM call of any kind. This typically
// finishes in a couple of seconds; 30s is generous headroom.
export const maxDuration = 30;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { raw?: Record<string, unknown> } | null;
  if (!body || typeof body.raw !== "object" || body.raw === null) {
    return Response.json({ error: "Missing inspector data to synthesize" }, { status: 400 });
  }
  const raw = body.raw as Record<string, InspectorResult>;

  try {
    const { report } = await assembleReport(raw);
    return Response.json({ report });
  } catch (error) {
    console.error("CPQ migration report assembly failed:", error);
    return Response.json({ error: "Report generation failed: could not assemble the report" }, { status: 502 });
  }
}
