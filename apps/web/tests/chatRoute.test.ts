import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { POST } from "../app/api/chat/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

const turn = (body: unknown) =>
  POST(new Request("https://example.test/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("chat route", () => {
  it("rejects a malformed turn with 400", async () => {
    expect((await turn({ kind: "message", conversationId: "c1" })).status).toBe(400);
  });

  it("says how to fix a missing model key, rather than 'try again'", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    const response = await turn({ kind: "message", conversationId: "c1", text: "hi", history: [] });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/LLM_API_KEY/);
  });
});
