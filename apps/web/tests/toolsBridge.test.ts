import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { POST } from "../app/api/tools/[toolName]/route";

const originalApiKey = process.env.TOOLS_API_KEY;

function request(body: unknown, authorization?: string) {
  return new Request("https://example.test/api/tools/find_account", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

function invoke(body: unknown, authorization?: string) {
  return POST(request(body, authorization), {
    params: Promise.resolve({ toolName: "find_account" }),
  });
}

describe("tools REST bridge", () => {
  beforeEach(() => {
    process.env.TOOLS_API_KEY = "test-secret";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalApiKey === undefined) delete process.env.TOOLS_API_KEY;
    else process.env.TOOLS_API_KEY = originalApiKey;
  });

  it("rejects a request without an Authorization header", async () => {
    const response = await invoke({ name: "Acme" });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("rejects a request with the wrong bearer token", async () => {
    const response = await invoke({ name: "Acme" }, "Bearer wrong-secret");
    expect(response.status).toBe(401);
  });

  it("returns the real result from a read tool", async () => {
    const response = await invoke({ name: "Acme" }, "Bearer test-secret");
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: expect.stringMatching(/Acme/i) }),
    ]));
    expect(result.meta).toEqual(expect.objectContaining({ source: "mock" }));
  });

  it("rejects an invalid body before connecting to MCP", async () => {
    const connectSpy = vi.spyOn(Client.prototype, "connect");
    const response = await invoke({}, "Bearer test-secret");
    expect(response.status).toBe(400);
    expect(connectSpy).not.toHaveBeenCalled();
  });
});
