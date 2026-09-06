import { readFile } from "node:fs/promises";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  const { runId } = await context.params;
  let contents = "";

  try {
    contents = await readFile(
      `${process.cwd()}/revenue-mcp-events.jsonl`,
      "utf8"
    );
  } catch {
    // A trace may be downloaded before any tool calls have been logged.
  }

  const events = contents
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as unknown];
      } catch {
        return [];
      }
    })
    .filter(
      (event): event is Record<string, unknown> =>
        typeof event === "object" &&
        event !== null &&
        (event as { runId?: unknown }).runId === runId
    );

  return new Response(JSON.stringify(events, null, 2), {
    status: 200,
    headers: {
      "Content-Disposition": `attachment; filename="trace-${runId}.json"`,
      "Content-Type": "application/json",
    },
  });
}
