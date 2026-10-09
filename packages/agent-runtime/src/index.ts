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
  /** IDs established by successful tool results before this proposal was created. */
  provenanceIds?: string[];
};

export type AgentTurnResult = {
  message: string;
  trace: AgentTraceEntry[];
  pendingConfirmation: PendingConfirmation | null;
};

export type AgentMode = "user" | "architect";
export type RunAgentTurnInput = (
  | { kind: "message"; text: string; history: ChatTurn[] }
  | { kind: "confirm"; pending: PendingConfirmation; history: ChatTurn[]; approverName?: string }
  | { kind: "cancel"; pending: PendingConfirmation; history: ChatTurn[] }) & { mode?: AgentMode };

export interface AgentRuntimeOptions {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  runId?: string;
}

type ToolEnvelope = {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; retryable: boolean };
  meta: { requestId: string; durationMs: number; source: "salesforce" | "policy" | "mock" };
};

type ChatToolCall = { id?: string; type?: "function"; function: { name: string; arguments: string } };
type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ChatToolCall[];
};

/** The model API refused or failed a request; `status` lets callers explain rate limits and bad keys. */
export class LlmApiError extends Error {
  constructor(readonly status: number, detail: string) {
    super(`LLM API ${status}: ${detail}`);
    this.name = "LlmApiError";
  }
}

export const AGENT_RUNTIME_DEFAULTS = {
  apiUrl: "https://openrouter.ai/api/v1/chat/completions",
  model: "deepseek/deepseek-v4-flash-0731",
  toolLoopLimit: 8,
  confirmationRequired: true,
} as const;

const MUTATION_TOOLS = new Set([
  "create_initial_quote",
  "create_renewal_quote",
  "create_amendment_quote",
  "add_quote_line",
  "remove_quote_line",
  "update_quote_line",
  "apply_discount",
]);
const CATALOG_MUTATION_TOOLS = new Set(["create_product", "update_product", "set_product_price", "add_bundle_component", "remove_bundle_component", "update_bundle_component"]);
const GENERATED_READ_TOOLS = [
  "explain_quote_line_price", "get_amendment_delta", "get_billing_summary", "get_bundle_pricing_rules",
  "get_cancellation_eligibility", "get_context_definition", "get_contract_obligations", "get_contract_pricing",
  "get_contract_status", "get_derived_pricing_source", "get_expression_set", "get_fulfillment_exceptions",
  "get_fulfillment_plan", "get_price_adjustment_schedule", "get_pricing_procedure", "get_product_attributes",
  "get_product_configuration", "get_product_selling_models", "get_qualification_rules", "get_quote_line_detail",
  "get_rate_card", "get_renewal_terms", "get_revenue_order_status", "get_subscription_pricing_detail",
  "list_catalog_categories", "list_decision_tables", "invoke_decision_table", "list_account_quotes",
];
const USER_TOOLS = new Set(["find_account", "get_account_revenue_context", "search_products", "get_account_assets", "get_quote_summary", ...MUTATION_TOOLS, ...GENERATED_READ_TOOLS]);
const ARCHITECT_TOOLS = new Set(["find_account", "get_account_revenue_context", "search_products", "get_account_assets", "get_quote_summary", "get_bundle_structure", ...CATALOG_MUTATION_TOOLS, ...GENERATED_READ_TOOLS]);

const SYSTEM_PROMPT = `You are a commercial assistant for Salesforce Revenue Management requests involving quotes, renewals, amendments, quote line items, and discounts.
Use the available tools to retrieve facts and perform requested work. Always resolve an account by name with find_account before calling any tool that needs an accountId. Use get_account_revenue_context and get_account_assets for account context, search_products to resolve products, and get_quote_summary to inspect a quote.
A request for a discount always means apply_discount on an existing quote line, never a renewal or a new quote. When the user names only the account, call list_account_quotes and use the newest open quote that has a line for the relevant product (or any line if no product is named); create a new quote only if the account has no open quote with lines.
Terms are in months: 1 year is 12, 3 years is 36. A renewal starts when the current subscription ends: use the assets' endDate (the renewal effective date is that date). Never use a date in the past or before the assets' startDate; if no end date is known, use today.
When the user's request requires creating a quote, adding or removing a line item, updating a line item's quantity, or applying a discount, call that tool directly with the real arguments you intend — you do not need to ask the user for permission yourself; a separate confirmation step outside your control handles that. Never invent an account ID, product ID, quote ID, quote line ID, or price — only use values you got from a tool result.`;

const ARCHITECT_SYSTEM_PROMPT = `You are a Salesforce Revenue Cloud consultant and solution architect assistant. Manage Product2 records, Standard Price Book prices, and bundle component structures with the available tools. Inspect existing records before changing them. For every write, call the intended tool directly with real fields. Do not ask the user for permission in your reply: the app shows them a confirmation card for the call you make, and nothing runs until they confirm. Never fabricate a product, pricebook entry, bundle component, component group, or relationship ID. Only use IDs returned by tools or explicitly supplied by the user.`;

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
  productNames: Map<string, string>,
  lineLabels: Map<string, string> = new Map()
): Promise<PendingConfirmation> {
  const pendingArgs = { ...args };
  delete pendingArgs.confirmedByUser;
  delete pendingArgs.idempotencyKey;
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
      return { toolName, args, summary: { title: "Ready to remove quote line", lines: [`Quote line: ${lineLabels.get(String(args.quoteLineId)) ?? display(args.quoteLineId)}`], confirmLabel: "Remove line item", cancelLabel: "Cancel" } };
    case "update_quote_line":
      return { toolName, args, summary: { title: "Ready to update quote line quantity", lines: [`Quote line: ${lineLabels.get(String(args.quoteLineId)) ?? display(args.quoteLineId)}`, `New quantity: ${display(args.quantity)}`], confirmLabel: "Update quantity", cancelLabel: "Cancel" } };
    case "apply_discount":
      return { toolName, args, summary: { title: "Ready to apply discount", lines: [`Quote: ${quote()}`, `Quote line: ${lineLabels.get(String(args.quoteLineId)) ?? display(args.quoteLineId)}`, `Discount: ${display(args.discountPercent)}%`], confirmLabel: "Apply discount", cancelLabel: "Cancel", ...(evaluateDiscount(args.discountPercent as number).decision === "approval_required" ? { requiresApproverName: true } : {}) } };
    case "create_product": return { toolName, args, summary: { title: "Ready to create product", lines: [`Name: ${display(args.name)}`, `Family: ${display(args.family)}`, `Type: ${display(args.type)}`], confirmLabel: "Create product", cancelLabel: "Cancel" } };
    case "update_product": return { toolName, args, summary: { title: "Ready to update product", lines: [`Product: ${display(args.productId)}`, `Name: ${display(args.name)}`], confirmLabel: "Update product", cancelLabel: "Cancel" } };
    case "set_product_price": return { toolName, args, summary: { title: "Ready to set product price", lines: [`Product: ${product()}`, `Unit price: ${display(args.unitPrice)}`], confirmLabel: "Set price", cancelLabel: "Cancel" } };
    case "add_bundle_component": return { toolName, args, summary: { title: "Ready to add bundle component", lines: [`Bundle: ${productNames.get(String(args.parentProductId)) ?? display(args.parentProductId)}`, `Component: ${productNames.get(String(args.childProductId)) ?? display(args.childProductId)}`, `Quantity: ${display(args.quantity)}`], confirmLabel: "Add component", cancelLabel: "Cancel" } };
    case "remove_bundle_component": return { toolName, args, summary: { title: "Ready to remove bundle component", lines: [`Component record: ${display(args.componentId)}`], confirmLabel: "Remove component", cancelLabel: "Cancel" } };
    case "update_bundle_component": return { toolName, args, summary: { title: "Ready to update bundle component", lines: [`Component record: ${display(args.componentId)}`], confirmLabel: "Update component", cancelLabel: "Cancel" } };
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

async function resolveQuoteId(client: Client, candidate: string, remember?: (result: ToolEnvelope) => void): Promise<string> {
  if (looksLikeSalesforceId(candidate)) return candidate;
  const { result } = await callRevenueTool(client, "get_quote_summary", { quoteNumber: candidate });
  remember?.(result);
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
  const mode = input.mode ?? "user";
  const allowedTools = mode === "architect" ? ARCHITECT_TOOLS : USER_TOOLS;
  const modeMutations = mode === "architect" ? CATALOG_MUTATION_TOOLS : MUTATION_TOOLS;
  const chatTools = tools.filter((tool) => allowedTools.has(tool.name)).map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
  }));
  const today = `Today's date is ${new Date().toISOString().slice(0, 10)}.`;
  const messages: ChatMessage[] = [{ role: "system", content: `${mode === "architect" ? ARCHITECT_SYSTEM_PROMPT : SYSTEM_PROMPT}\n${today}` }, ...input.history];
  const trace: AgentTraceEntry[] = [];
  const accountNames = new Map<string, string>();
  const quoteNumbers = new Map<string, string>();
  const lineLabels = new Map<string, string>();
  const productNames = new Map<string, string>();
  const seenIds = new Set<string>();
  let latestText = "";
  let confirmedMessage = "";

  const rememberResult = (result: ToolEnvelope) => {
    if (!result.ok) return;
    const visit = (value: unknown) => {
      if (typeof value === "string" && looksLikeSalesforceId(value)) seenIds.add(value);
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach(visit);
    };
    visit(result.data);
    // list_account_quotes: remember quote numbers, and label each line by its product.
    if (Array.isArray(result.data)) {
      for (const item of result.data as Array<Record<string, unknown>>) {
        if (typeof item?.quoteId === "string" && typeof item.quoteNumber === "string") quoteNumbers.set(item.quoteId, item.quoteNumber);
        for (const line of Array.isArray(item?.lines) ? (item.lines as Array<Record<string, unknown>>) : []) {
          if (typeof line.quoteLineId === "string" && typeof line.productName === "string") {
            lineLabels.set(line.quoteLineId, typeof line.quantity === "number" ? `${line.productName} × ${line.quantity}` : line.productName);
          }
        }
      }
    }
    if (Array.isArray(result.data) || !result.data || typeof result.data !== "object") return;
    const data = result.data as Record<string, unknown>;
    if (typeof data.quoteId === "string" && typeof data.quoteNumber === "string") {
      quoteNumbers.set(data.quoteId, data.quoteNumber);
    }
  };

  for (const id of input.kind === "confirm" ? input.pending.provenanceIds ?? [] : []) {
    if (looksLikeSalesforceId(id)) seenIds.add(id);
  }
  const userMessages = [
    ...input.history.filter((message) => message.role === "user").map((message) => message.content),
    ...(input.kind === "message" ? [input.text] : []),
  ];
  const unprovenId = (args: Record<string, unknown>): { field: string; id: string } | null => {
    const visit = (value: unknown, path: string): { field: string; id: string } | null => {
      if (typeof value === "string" && looksLikeSalesforceId(value)) {
        return seenIds.has(value) || userMessages.some((message) => message.includes(value)) ? null : { field: path, id: value };
      }
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
          const invalid = visit(value[index], `${path}[${index}]`);
          if (invalid) return invalid;
        }
      } else if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          const invalid = visit(child, path ? `${path}.${key}` : key);
          if (invalid) return invalid;
        }
      }
      return null;
    };
    return visit(args, "");
  };
  const provenanceFailure = (invalid: { field: string; id: string }): AgentTurnResult => ({
    message: `I can't proceed because ${invalid.field} references Salesforce ID ${invalid.id}, which hasn't been looked up in this conversation or supplied by you. Please ask me to look it up first. If you supply the ID yourself, Salesforce will validate it directly.`,
    trace,
    pendingConfirmation: null,
  });

  if (input.kind === "message") {
    messages.push({ role: "user", content: input.text });
  } else {
    if (!modeMutations.has(input.pending.toolName)) {
      throw new Error(`Cannot confirm non-mutation tool: ${input.pending.toolName}`);
    }
    const pendingArgs = { ...input.pending.args };
    if (typeof pendingArgs.quoteId === "string") pendingArgs.quoteId = await resolveQuoteId(client, pendingArgs.quoteId, rememberResult);
    if (typeof pendingArgs.sourceQuoteId === "string") pendingArgs.sourceQuoteId = await resolveQuoteId(client, pendingArgs.sourceQuoteId, rememberResult);
    const invalid = unprovenId(pendingArgs);
    if (invalid) return provenanceFailure(invalid);
    const args = { ...pendingArgs, confirmedByUser: true, idempotencyKey: crypto.randomUUID(), ...(input.approverName ? { approvedBy: input.approverName } : {}) };
    const { result, durationMs } = await callRevenueTool(client, input.pending.toolName, args);
    const blocked = !result.ok && (result.error?.code === "DISCOUNT_REJECTED" || result.error?.code === "CONFIRMATION_REQUIRED");
    trace.push({ tool: input.pending.toolName, badge: "WRITE", durationMs, blocked, summary: resultSummary(input.pending.toolName, result) });
    rememberResult(result);
    confirmedMessage = resultMessage(input.pending.toolName, result);
    const confirmedToolCallId = `confirmed-${crypto.randomUUID()}`;
    messages.push({
      role: "assistant",
      content: "",
      tool_calls: [{ id: confirmedToolCallId, type: "function", function: { name: input.pending.toolName, arguments: JSON.stringify(args) } }],
    });
    messages.push({ role: "tool", tool_call_id: confirmedToolCallId, content: JSON.stringify(result) });
  }

  const combinedMessage = (continuation: string) => {
    if (!confirmedMessage) return continuation;
    return continuation ? `${confirmedMessage} ${continuation}` : confirmedMessage;
  };

  const callModel = async (toolChoice: "auto" | "none"): Promise<ChatMessage> => {
    const apiKey = options.apiKey ?? process.env.LLM_API_KEY;
    if (!apiKey) throw new Error("LLM_API_KEY is required to call the configured chat completions API");
    const llmRequestInit: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: options.model ?? AGENT_RUNTIME_DEFAULTS.model, messages, tools: chatTools, tool_choice: toolChoice, stream: false, max_tokens: 2048 }),
    };
    const llmRetryDelaysMs = [1000, 2000];
    let response: Response | undefined;
    for (let attempt = 0; ; attempt += 1) {
      let networkError: unknown;
      try {
        response = await fetch(options.apiUrl ?? AGENT_RUNTIME_DEFAULTS.apiUrl, llmRequestInit);
      } catch (error) {
        networkError = error;
      }
      const transientStatus = response ? [502, 503, 504].includes(response.status) : false;
      if ((!networkError && !transientStatus) || attempt >= llmRetryDelaysMs.length) {
        if (networkError) throw networkError;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, llmRetryDelaysMs[attempt]));
    }
    if (!response) throw new Error("LLM API request failed with no response");
    if (!response.ok) throw new LlmApiError(response.status, (await response.text()).slice(0, 300));
    const body = await response.json() as { choices?: Array<{ message?: ChatMessage }> };
    const assistant = body.choices?.[0]?.message;
    if (!assistant) throw new Error("LLM API response did not contain choices[0].message");
    return assistant;
  };

  for (let iteration = 0; iteration < AGENT_RUNTIME_DEFAULTS.toolLoopLimit; iteration += 1) {
    const assistant = await callModel("auto");
    latestText = assistant.content ?? latestText;
    messages.push(assistant);
    const calls = (assistant.tool_calls ?? []).map((call) => {
      let args: unknown;
      try {
        args = JSON.parse(call.function.arguments);
      } catch (error) {
        throw new Error(`LLM API returned malformed JSON arguments for tool ${call.function.name}: ${(error as Error).message}`);
      }
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        throw new Error(`LLM API returned non-object arguments for tool ${call.function.name}`);
      }
      return { ...call, function: { ...call.function, arguments: args as Record<string, unknown> } };
    });
    if (calls.length === 0) return { message: combinedMessage(assistant.content ?? ""), trace, pendingConfirmation: null };
    const unavailable = calls.find((call) => !allowedTools.has(call.function.name));
    if (unavailable) throw new Error(`Tool ${unavailable.function.name} is not available in ${mode} mode`);

    const mutation = calls.find((call) => modeMutations.has(call.function.name));
    if (mutation) {
      const mutationArgs = { ...(mutation.function.arguments ?? {}) };
      if (typeof mutationArgs.quoteId === "string") mutationArgs.quoteId = await resolveQuoteId(client, mutationArgs.quoteId, rememberResult);
      if (typeof mutationArgs.sourceQuoteId === "string") mutationArgs.sourceQuoteId = await resolveQuoteId(client, mutationArgs.sourceQuoteId, rememberResult);
      const invalid = unprovenId(mutationArgs);
      if (invalid) return provenanceFailure(invalid);
      const pending = await confirmationFor(client, mutation.function.name, mutationArgs, accountNames, quoteNumbers, productNames, lineLabels);
      const authorizedIds = new Set(seenIds);
      const rememberAuthorizedArgument = (value: unknown) => {
        if (typeof value === "string" && looksLikeSalesforceId(value)) authorizedIds.add(value);
        else if (Array.isArray(value)) value.forEach(rememberAuthorizedArgument);
        else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach(rememberAuthorizedArgument);
      };
      rememberAuthorizedArgument(mutationArgs);
      pending.provenanceIds = [...authorizedIds];
      return { message: combinedMessage(proposedMessage(pending)), trace, pendingConfirmation: pending };
    }

    for (const call of calls) {
      const args = { ...(call.function.arguments ?? {}) };
      if (typeof args.quoteId === "string") args.quoteId = await resolveQuoteId(client, args.quoteId, rememberResult);
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
      if (!call.id) throw new Error(`LLM API tool call ${call.function.name} did not contain an id`);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  // Out of tool rounds: rather than return a half-finished "let me check..." as if it were the
  // answer, ask once more with tools off, so the user gets what was found and what's missing.
  messages.push({
    role: "user",
    content: "You have run out of tool calls for this turn. Reply now, without tools: summarise what you found, what you could not complete, and what the user should do next.",
  });
  const wrapUp = await callModel("none");
  return { message: combinedMessage(wrapUp.content || latestText), trace, pendingConfirmation: null };
}
