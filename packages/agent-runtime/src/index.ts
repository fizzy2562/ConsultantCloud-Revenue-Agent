import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "@consultantcloud/revenue-mcp";
import type { RevenueGateway } from "@consultantcloud/shared";
import { evaluateDiscount } from "@consultantcloud/policy";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AgentTraceEntry = {
  tool: string;
  badge: "READ" | "WRITE" | "GATE";
  durationMs: number;
  blocked: boolean;
  summary: string;
};

export type PendingConfirmation = {
  toolName: string;
  args: Record<string, unknown>;
  summary: { title: string; lines: string[]; confirmLabel: string; cancelLabel: string; requiresApproverName?: boolean };
};

export type AgentTurnResult = {
  message: string;
  trace: AgentTraceEntry[];
  pendingConfirmation: PendingConfirmation | null;
};

export type RunAgentTurnInput =
  | { kind: "message"; text: string; history: ChatTurn[] }
  | { kind: "confirm"; pending: PendingConfirmation; history: ChatTurn[]; approverName?: string }
  | { kind: "cancel"; pending: PendingConfirmation; history: ChatTurn[] };

export interface AgentRuntimeOptions {
  ollamaUrl?: string;
  model?: string;
  runId?: string;
}

type ToolEnvelope = {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; retryable: boolean };
  meta: { requestId: string; durationMs: number; source: "salesforce" | "policy" | "mock" };
};

type OllamaToolCall = { function: { name: string; arguments?: Record<string, unknown> } };
type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_name?: string;
  tool_calls?: OllamaToolCall[];
};

const MUTATION_TOOLS = new Set([
  "create_initial_quote",
  "create_renewal_quote",
  "create_amendment_quote",
  "add_quote_line",
  "remove_quote_line",
  "update_quote_line",
  "apply_discount",
]);

const SYSTEM_PROMPT = `You are a commercial assistant for Salesforce Revenue Management requests involving quotes, renewals, amendments, quote line items, and discounts.
Use the available tools to retrieve facts and perform requested work. Always resolve an account by name with find_account before calling any tool that needs an accountId. Use get_account_revenue_context and get_account_assets for account context, search_products to resolve products, and get_quote_summary to inspect a quote.
When the user's request requires creating a quote, adding or removing a line item, updating a line item's quantity, or applying a discount, call that tool directly with the real arguments you intend — you do not need to ask the user for permission yourself; a separate confirmation step outside your control handles that. Never invent an account ID, product ID, quote ID, quote line ID, or price — only use values you got from a tool result.`;

async function connectedClient(gateway: RevenueGateway, options: AgentRuntimeOptions) {
  const server = createServer(gateway, { runId: options.runId });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "agent-runtime", version: "0.1.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function parseToolResult(result: unknown): ToolEnvelope {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  const first = content?.[0];
  if (!first || first.type !== "text" || typeof first.text !== "string") {
    throw new Error("Revenue MCP tool returned no JSON text content");
  }
  return JSON.parse(first.text) as ToolEnvelope;
}

function display(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "Not specified";
}

async function confirmationFor(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
  accountNames: Map<string, string>,
  quoteNumbers: Map<string, string>,
  productNames: Map<string, string>
): Promise<PendingConfirmation> {
  const pendingArgs = { ...args };
  if ((toolName === "add_quote_line" || toolName === "apply_discount") && typeof pendingArgs.quoteId === "string") {
    pendingArgs.quoteId = await resolveQuoteId(client, pendingArgs.quoteId);
  }
  if (toolName === "create_amendment_quote" && typeof pendingArgs.sourceQuoteId === "string") {
    pendingArgs.sourceQuoteId = await resolveQuoteId(client, pendingArgs.sourceQuoteId);
  }
  args = pendingArgs;
  const account = () => accountNames.get(String(args.accountId)) ?? display(args.accountId);
  const quote = () => quoteNumbers.get(String(args.quoteId)) ?? display(args.quoteId);
  const product = () => productNames.get(String(args.productId)) ?? display(args.productId);
  switch (toolName) {
    case "create_initial_quote":
      return { toolName, args, summary: { title: "Ready to create initial quote", lines: [`Account: ${account()}`, `Term: ${display(args.termMonths)} months`], confirmLabel: "Create quote", cancelLabel: "Cancel" } };
    case "create_renewal_quote":
      return { toolName, args, summary: { title: "Ready to create renewal quote", lines: [`Account: ${account()}`, `Term: ${display(args.termMonths)} months`, `Effective date: ${display(args.effectiveDate)}`], confirmLabel: "Create renewal", cancelLabel: "Cancel" } };
    case "create_amendment_quote":
      return { toolName, args, summary: { title: "Ready to create amendment quote", lines: [`Account: ${account()}`, `Source quote: ${quoteNumbers.get(String(args.sourceQuoteId)) ?? display(args.sourceQuoteId)}`], confirmLabel: "Create amendment", cancelLabel: "Cancel" } };
    case "add_quote_line":
      return { toolName, args, summary: { title: "Ready to add quote line", lines: [`Quote: ${quote()}`, `Product: ${product()}`, `Quantity: ${display(args.quantity)}`], confirmLabel: "Add line item", cancelLabel: "Cancel" } };
    case "remove_quote_line":
      return { toolName, args, summary: { title: "Ready to remove quote line", lines: [`Quote line: ${display(args.quoteLineId)}`], confirmLabel: "Remove line item", cancelLabel: "Cancel" } };
    case "update_quote_line":
      return { toolName, args, summary: { title: "Ready to update quote line quantity", lines: [`Quote line: ${display(args.quoteLineId)}`, `New quantity: ${display(args.quantity)}`], confirmLabel: "Update quantity", cancelLabel: "Cancel" } };
    case "apply_discount":
      return { toolName, args, summary: { title: "Ready to apply discount", lines: [`Quote: ${quote()}`, `Quote line: ${display(args.quoteLineId)}`, `Discount: ${display(args.discountPercent)}%`], confirmLabel: "Apply discount", cancelLabel: "Cancel", ...(evaluateDiscount(args.discountPercent as number).decision === "approval_required" ? { requiresApproverName: true } : {}) } };
    default:
      throw new Error(`Unsupported mutation tool: ${toolName}`);
  }
}

function proposedMessage(pending: PendingConfirmation): string {
  return `${pending.summary.title}. Please review the details and confirm to continue.`;
}

function resultSummary(tool: string, result: ToolEnvelope): string {
  if (!result.ok) return result.error?.message ?? `${tool} failed`;
  const data = result.data as Record<string, unknown> | Array<Record<string, unknown>> | undefined;
  if (tool === "find_account") {
    const matches = Array.isArray(data) ? data : [];
    return matches[0] ? `${display(matches[0].name)} found` : "No matching account";
  }
  if (tool === "search_products") {
    const matches = Array.isArray(data) ? data : [];
    return matches[0] ? `${display(matches[0].name)} located` : "No matching product";
  }
  if (tool === "get_account_assets") return `${Array.isArray(data) ? data.length : 0} account assets found`;
  if (tool === "get_account_revenue_context") return "Revenue context retrieved";
  if (tool === "get_quote_summary") return `Quote ${display(!Array.isArray(data) && data?.quoteNumber)} retrieved`;
  if (tool === "create_initial_quote" || tool === "create_renewal_quote") return `Quote ${display(!Array.isArray(data) && data?.quoteNumber)} created`;
  if (tool === "create_amendment_quote") return `Quote ${display(!Array.isArray(data) && data?.quoteNumber)} created`;
  if (tool === "add_quote_line") return `Quote line ${display(!Array.isArray(data) && data?.quoteLineId)} added`;
  if (tool === "remove_quote_line") return `Quote line ${display(!Array.isArray(data) && data?.quoteLineId)} removed`;
  if (tool === "update_quote_line") return `Quote line ${display(!Array.isArray(data) && data?.quoteLineId)} updated to quantity ${display(!Array.isArray(data) && data?.quantity)}`;
  if (tool === "apply_discount") return `${display(!Array.isArray(data) && data?.appliedDiscountPercent)}% discount applied`;
  return `${tool} completed`;
}

function resultMessage(tool: string, result: ToolEnvelope): string {
  if (!result.ok) return result.error?.message ?? `The ${tool} operation failed.`;
  return `${resultSummary(tool, result)}.`;
}

async function callRevenueTool(client: Client, name: string, args: Record<string, unknown>) {
  const started = Date.now();
  const raw = await client.callTool({ name, arguments: args }, CallToolResultSchema);
  return { result: parseToolResult(raw), durationMs: Date.now() - started };
}

function looksLikeSalesforceId(value: string): boolean {
  return /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(value);
}

async function resolveQuoteId(client: Client, candidate: string): Promise<string> {
  if (looksLikeSalesforceId(candidate)) return candidate;
  const { result } = await callRevenueTool(client, "get_quote_summary", { quoteNumber: candidate });
  if (result.ok && typeof (result.data as { quoteId?: unknown })?.quoteId === "string") {
    return (result.data as { quoteId: string }).quoteId;
  }
  return candidate;
}

export async function runAgentTurn(
  input: RunAgentTurnInput,
  gateway: RevenueGateway,
  options: AgentRuntimeOptions = {}
): Promise<AgentTurnResult> {
  if (input.kind === "cancel") return { message: "No changes made.", trace: [], pendingConfirmation: null };

  const client = await connectedClient(gateway, options);
  const { tools } = await client.listTools();
  const ollamaTools = tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }));
  const messages: OllamaMessage[] = [{ role: "system", content: SYSTEM_PROMPT }, ...input.history];
  const trace: AgentTraceEntry[] = [];
  const accountNames = new Map<string, string>();
  const quoteNumbers = new Map<string, string>();
  const productNames = new Map<string, string>();
  let latestText = "";
  let confirmedMessage = "";

  const rememberResult = (result: ToolEnvelope) => {
    if (!result.ok || Array.isArray(result.data) || !result.data || typeof result.data !== "object") return;
    const data = result.data as Record<string, unknown>;
    if (typeof data.quoteId === "string" && typeof data.quoteNumber === "string") {
      quoteNumbers.set(data.quoteId, data.quoteNumber);
    }
  };

  if (input.kind === "message") {
    messages.push({ role: "user", content: input.text });
  } else {
    if (!MUTATION_TOOLS.has(input.pending.toolName)) {
      throw new Error(`Cannot confirm non-mutation tool: ${input.pending.toolName}`);
    }
    const pendingArgs = { ...input.pending.args };
    if (typeof pendingArgs.quoteId === "string") pendingArgs.quoteId = await resolveQuoteId(client, pendingArgs.quoteId);
    if (typeof pendingArgs.sourceQuoteId === "string") pendingArgs.sourceQuoteId = await resolveQuoteId(client, pendingArgs.sourceQuoteId);
    const args = { ...pendingArgs, confirmedByUser: true, idempotencyKey: crypto.randomUUID(), ...(input.approverName ? { approvedBy: input.approverName } : {}) };
    const { result, durationMs } = await callRevenueTool(client, input.pending.toolName, args);
    const blocked = !result.ok && (result.error?.code === "DISCOUNT_REJECTED" || result.error?.code === "CONFIRMATION_REQUIRED");
    trace.push({ tool: input.pending.toolName, badge: "WRITE", durationMs, blocked, summary: resultSummary(input.pending.toolName, result) });
    rememberResult(result);
    confirmedMessage = resultMessage(input.pending.toolName, result);
    messages.push({
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: input.pending.toolName, arguments: args } }],
    });
    messages.push({ role: "tool", tool_name: input.pending.toolName, content: JSON.stringify(result) });
  }

  const combinedMessage = (continuation: string) => {
    if (!confirmedMessage) return continuation;
    return continuation ? `${confirmedMessage} ${continuation}` : confirmedMessage;
  };

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const baseUrl = (options.ollamaUrl ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: options.model ?? "qwen3.8:27b", stream: false, think: false, messages, tools: ollamaTools }),
    });
    if (!response.ok) throw new Error(`Ollama ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const body = await response.json() as { message?: OllamaMessage };
    const assistant = body.message;
    if (!assistant) throw new Error("Ollama response did not contain a message");
    latestText = assistant.content ?? latestText;
    messages.push(assistant);
    const calls = assistant.tool_calls ?? [];
    if (calls.length === 0) return { message: combinedMessage(assistant.content), trace, pendingConfirmation: null };

    const mutation = calls.find((call) => MUTATION_TOOLS.has(call.function.name));
    if (mutation) {
      const pending = await confirmationFor(client, mutation.function.name, mutation.function.arguments ?? {}, accountNames, quoteNumbers, productNames);
      return { message: combinedMessage(proposedMessage(pending)), trace, pendingConfirmation: pending };
    }

    for (const call of calls) {
      const args = { ...(call.function.arguments ?? {}) };
      if (typeof args.quoteId === "string") args.quoteId = await resolveQuoteId(client, args.quoteId);
      const { result, durationMs } = await callRevenueTool(client, call.function.name, args);
      trace.push({ tool: call.function.name, badge: "READ", durationMs, blocked: false, summary: resultSummary(call.function.name, result) });
      if (call.function.name === "find_account" && result.ok && Array.isArray(result.data)) {
        for (const account of result.data as Array<Record<string, unknown>>) {
          if (typeof account.id === "string" && typeof account.name === "string") accountNames.set(account.id, account.name);
        }
      }
      if (call.function.name === "search_products" && result.ok && Array.isArray(result.data)) {
        for (const product of result.data as Array<Record<string, unknown>>) {
          if (typeof product.id === "string" && typeof product.name === "string") productNames.set(product.id, product.name);
        }
      }
      rememberResult(result);
      messages.push({ role: "tool", tool_name: call.function.name, content: JSON.stringify(result) });
    }
  }

  return { message: combinedMessage(latestText), trace, pendingConfirmation: null };
}
