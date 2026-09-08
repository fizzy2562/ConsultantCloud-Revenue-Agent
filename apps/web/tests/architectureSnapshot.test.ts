import { afterEach, describe, expect, it } from "vitest";
import { assembleArchitectureSnapshot } from "../lib/architectureSnapshot";
import { toolCatalog } from "@consultantcloud/revenue-mcp";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("architecture snapshot", () => {
  it("assembles current runtime and repository evidence", async () => {
    delete process.env.SF_INSTANCE_URL;
    delete process.env.SF_ACCESS_TOKEN;
    const snapshot = await assembleArchitectureSnapshot(new Date("2026-09-07T12:00:00.000Z"));
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.generatedAt).toBe("2026-09-07T12:00:00.000Z");
    expect(snapshot.gateway.mode).toBe("mock");
    expect(snapshot.tools).toHaveLength(toolCatalog.length);
    expect(snapshot.policies.resilience.wired).toBe(true);
    expect(snapshot.salesforce.objects).toContain("QuoteLineItem");
    expect(snapshot.agentforce.operationIds).toContain("find_account");
    expect(snapshot.agentforce.deploymentStatus).toBe("unknown");
    expect(snapshot.observability.durable).toBe(false);
  });

  it("never serializes configured secret values or URL credentials", async () => {
    process.env.SF_INSTANCE_URL = "https://salesforce-secret.example";
    process.env.SF_ACCESS_TOKEN = "sf-super-secret-value";
    process.env.TOOLS_API_KEY = "tools-super-secret-value";
    process.env.LLM_API_KEY = "llm-super-secret-value";
    process.env.LLM_API_URL = "https://llm-user:llm-url-secret@models.example:11434/private";
    const json = JSON.stringify(await assembleArchitectureSnapshot());
    expect(json).not.toContain("sf-super-secret-value");
    expect(json).not.toContain("tools-super-secret-value");
    expect(json).not.toContain("llm-super-secret-value");
    expect(json).not.toContain("llm-url-secret");
    expect(json).not.toContain("salesforce-secret.example");
    expect(json).toContain("models.example:11434");
  });
});
