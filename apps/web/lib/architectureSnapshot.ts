import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AGENT_RUNTIME_DEFAULTS } from "@consultantcloud/agent-runtime";
import { SALESFORCE_CAPABILITIES, toolCatalog } from "@consultantcloud/revenue-mcp";
import {
  circuitBreakerDefaults,
  discountPolicyBands,
  protectedMutationActions,
  retryDefaults,
} from "@consultantcloud/policy";

export type ArchitectureSnapshot = Awaited<ReturnType<typeof assembleArchitectureSnapshot>>;

function safeOllamaHost(value: string): string {
  try {
    const url = new URL(value);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return "invalid-configured-host";
  }
}

async function agentforceContract() {
  const candidates = [
    resolve(process.cwd(), "docs/agentforce-external-service.openapi.yaml"),
    resolve(process.cwd(), "../../docs/agentforce-external-service.openapi.yaml"),
  ];
  for (const path of candidates) {
    try {
      const yaml = await readFile(/* turbopackIgnore: true */ path, "utf8");
      const operationIds = [...yaml.matchAll(/^\s*operationId:\s*([^\s#]+)/gm)].map((match) => match[1]!);
      const serverUrl = yaml.match(/^\s*- url:\s*([^\s#]+)/m)?.[1] ?? "unknown";
      return { operationIds, serverUrl, deploymentStatus: "unknown" as const };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return { operationIds: [] as string[], serverUrl: "not-present", deploymentStatus: "unknown" as const };
}

export async function assembleArchitectureSnapshot(now: Date = new Date()) {
  const hasInstanceUrl = Boolean(process.env.SF_INSTANCE_URL);
  const hasAccessToken = Boolean(process.env.SF_ACCESS_TOKEN);
  const salesforceConfigured = hasInstanceUrl && hasAccessToken;
  const configuredOllamaUrl = process.env.OLLAMA_URL ?? AGENT_RUNTIME_DEFAULTS.ollamaUrl;
  const model = AGENT_RUNTIME_DEFAULTS.model;
  const agentforce = await agentforceContract();

  const warnings = [
    "Agentforce org-side deployment cannot be verified from this repository.",
    "Trace events are stored in a process-relative JSONL file and are instance-local, not durable.",
  ];
  if (hasInstanceUrl !== hasAccessToken) {
    warnings.push("Salesforce credentials are only partially configured, so the mock gateway is active.");
  }
  if (toolCatalog.find((tool) => tool.name === "add_quote_line")?.confirmationRequired === false) {
    warnings.push("add_quote_line is confirmation-gated by the agent runtime but is absent from the protected-mutation policy list.");
  }

  return {
    schemaVersion: 1 as const,
    generatedAt: now.toISOString(),
    application: {
      name: "ConsultantCloud Revenue Agent",
      apiRoutes: ["/api/chat", "/api/tools/[toolName]", "/api/runs/[runId]/trace", "/api/system/architecture"],
    },
    agentRuntime: {
      model,
      ollamaHost: safeOllamaHost(configuredOllamaUrl),
      toolLoopLimit: AGENT_RUNTIME_DEFAULTS.toolLoopLimit,
      confirmationRequired: AGENT_RUNTIME_DEFAULTS.confirmationRequired,
    },
    gateway: {
      mode: salesforceConfigured ? "salesforce" as const : "mock" as const,
      reason: salesforceConfigured
        ? "Both required Salesforce credential settings are present."
        : "The mock gateway is used unless both required Salesforce credential settings are present.",
    },
    tools: toolCatalog.map(({ successShape: _successShape, ...contractTool }) => contractTool),
    policies: {
      discountBands: discountPolicyBands,
      protectedMutations: protectedMutationActions,
      resilience: { wired: true, retry: retryDefaults, circuitBreaker: circuitBreakerDefaults },
    },
    salesforce: SALESFORCE_CAPABILITIES,
    agentforce,
    observability: {
      traceStore: "File-backed, process-relative revenue-mcp-events.jsonl (instance-local)",
      durable: false,
    },
    warnings,
  };
}
