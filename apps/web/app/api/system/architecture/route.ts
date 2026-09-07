import { assembleArchitectureSnapshot } from "../../../../lib/architectureSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This endpoint must be role-gated before any non-demo exposure.
export async function GET() {
  return Response.json(await assembleArchitectureSnapshot());
}
