import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { POST } from "../app/api/tools/[toolName]/route";

const originalApiKey = process.env.TOOLS_API_KEY;
const originalCatalogApiKey = process.env.CATALOG_TOOLS_API_KEY;

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

function invoke(body: unknown, authorization?: string, toolName = "find_account") {
  return POST(request(body, authorization), {
    params: Promise.resolve({ toolName }),
  });
}

describe("tools REST bridge", () => {
  beforeEach(() => {
    process.env.TOOLS_API_KEY = "test-secret";
    process.env.CATALOG_TOOLS_API_KEY = "catalog-secret";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalApiKey === undefined) delete process.env.TOOLS_API_KEY;
    else process.env.TOOLS_API_KEY = originalApiKey;
    if (originalCatalogApiKey === undefined) delete process.env.CATALOG_TOOLS_API_KEY;
    else process.env.CATALOG_TOOLS_API_KEY = originalCatalogApiKey;
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

  it("keeps revenue and catalog bearer credentials in separate scopes", async () => {
    expect((await invoke({ name: "New Product", confirmedByUser: true, idempotencyKey: "catalog-1" }, "Bearer test-secret", "create_product")).status).toBe(401);
    expect((await invoke({ name: "Acme" }, "Bearer catalog-secret")).status).toBe(401);

    expect((await invoke({ name: "Acme" }, "Bearer test-secret")).status).toBe(200);
    expect((await invoke({ name: "New Product", confirmedByUser: true, idempotencyKey: "catalog-2" }, "Bearer catalog-secret", "create_product")).status).toBe(200);
  });

  it("fails closed for catalog tools when their key is unset", async () => {
    delete process.env.CATALOG_TOOLS_API_KEY;
    const response = await invoke({ name: "New Product", confirmedByUser: true, idempotencyKey: "catalog-3" }, "Bearer test-secret", "create_product");
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Tools API is not configured" });
  });
});
