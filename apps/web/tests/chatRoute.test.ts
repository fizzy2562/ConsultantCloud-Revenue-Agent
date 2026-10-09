import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const runAgentTurn = vi.fn();
vi.mock("@consultantcloud/agent-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@consultantcloud/agent-runtime")>()),
  runAgentTurn: (...args: unknown[]) => runAgentTurn(...args),
}));

import { LlmApiError } from "@consultantcloud/agent-runtime";
import { POST } from "../app/api/chat/route";

// Obviously fake, so secret scanners do not mistake it for a real key.
const DEPLOYMENT_KEY = "test-" + "z".repeat(24);
const OWN_KEY = "test-" + "y".repeat(24);

beforeEach(() => {
  runAgentTurn.mockReset().mockResolvedValue({ message: "ok", trace: [], pendingConfirmation: null });
  vi.stubEnv("LLM_API_KEY", DEPLOYMENT_KEY);
  vi.stubEnv("LLM_MODEL", "nvidia/free-model:free");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const turn = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("https://example.test/api/chat", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
const message = { kind: "message", conversationId: "c1", text: "hi", history: [] };
const optionsUsed = () => runAgentTurn.mock.calls[0]![2] as { apiKey?: string; model?: string };

describe("chat route", () => {
  it("rejects a malformed turn with 400", async () => {
    expect((await turn({ kind: "message", conversationId: "c1" })).status).toBe(400);
  });

  it("says how to fix a missing model key, rather than 'try again'", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    const response = await turn(message);
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/Connection tab.*LLM_API_KEY/);
  });

  it("uses the deployment's key and model by default", async () => {
    await turn(message);
    expect(optionsUsed()).toMatchObject({ apiKey: DEPLOYMENT_KEY, model: "nvidia/free-model:free" });
  });

  it("uses a visitor's own key with their model, not the deployment's free model", async () => {
    await turn(message, { "x-llm-api-key": OWN_KEY, "x-llm-model": "deepseek/deepseek-v4-flash-0731" });
    expect(optionsUsed()).toMatchObject({ apiKey: OWN_KEY, model: "deepseek/deepseek-v4-flash-0731" });
  });

  it("gives a visitor's own key the runtime's default model when they don't choose one", async () => {
    await turn(message, { "x-llm-api-key": OWN_KEY });
    expect(optionsUsed().apiKey).toBe(OWN_KEY);
    expect(optionsUsed().model).toBeUndefined();
  });

  it("works with only a visitor's key, even when the deployment has none", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    expect((await turn(message, { "x-llm-api-key": OWN_KEY })).status).toBe(200);
  });

  it("refuses a malformed key or model name", async () => {
    expect((await turn(message, { "x-llm-api-key": "short" })).status).toBe(400);
    expect((await turn(message, { "x-llm-api-key": OWN_KEY, "x-llm-model": "bad model <script>" })).status).toBe(400);
    expect(runAgentTurn).not.toHaveBeenCalled();
  });

  it("points to bring-your-own-key when the free model hits its limit", async () => {
    runAgentTurn.mockRejectedValue(new LlmApiError(429, "rate limited"));
    const response = await turn(message);
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/free model has hit its limit.*own OpenRouter key/);
  });

  it("says when a visitor's own key is rejected", async () => {
    runAgentTurn.mockRejectedValue(new LlmApiError(401, "invalid key"));
    const response = await turn(message, { "x-llm-api-key": OWN_KEY });
    expect((await response.json()).error).toMatch(/Your API key was rejected/);
  });

  it("keeps other failures generic, and never echoes the key", async () => {
    runAgentTurn.mockRejectedValue(new Error(`boom ${OWN_KEY}`));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await turn(message, { "x-llm-api-key": OWN_KEY });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(OWN_KEY);
  });
});
