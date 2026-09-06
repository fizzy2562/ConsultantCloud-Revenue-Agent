import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "../app/api/runs/[runId]/trace/route";

const originalCwd = process.cwd();
let fixtureDirectory: string;

function invoke(runId: string) {
  return GET(new Request(`https://example.test/api/runs/${runId}/trace`), {
    params: Promise.resolve({ runId }),
  });
}

describe("run trace download", () => {
  beforeEach(async () => {
    fixtureDirectory = await mkdtemp(join(tmpdir(), "run-trace-"));
    process.chdir(fixtureDirectory);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(fixtureDirectory, { recursive: true, force: true });
  });

  it("returns only matching events with download headers", async () => {
    const matchingEvents = [
      { runId: "run-123", tool: "find_account", status: "success" },
      { runId: "run-123", tool: "get_quote_summary", status: "success" },
    ];
    await writeFile(
      join(fixtureDirectory, "revenue-mcp-events.jsonl"),
      [
        JSON.stringify(matchingEvents[0]),
        "not valid json",
        JSON.stringify({ runId: "another-run", tool: "search_products" }),
        "",
        JSON.stringify(matchingEvents[1]),
      ].join("\n"),
      "utf8"
    );

    const response = await invoke("run-123");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="trace-run-123.json"'
    );
    await expect(response.json()).resolves.toEqual(matchingEvents);
  });

  it("returns an empty array when no events match", async () => {
    await writeFile(
      join(fixtureDirectory, "revenue-mcp-events.jsonl"),
      `${JSON.stringify({ runId: "another-run", tool: "find_account" })}\n`,
      "utf8"
    );

    const response = await invoke("run-123");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });

  it("returns an empty array when the event file does not exist", async () => {
    const response = await invoke("run-123");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
  });
});
