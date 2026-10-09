#!/usr/bin/env node
/**
 * Org smoke test: drives a running app (chat + tools API) against the Salesforce org it's
 * connected to, and checks each scenario's real outcome. Opt-in, because it needs a live org,
 * a model key and the app running:
 *
 *   APP_URL=http://localhost:3000 TOOLS_API_KEY=<the app's key> pnpm test:org
 *
 * The app must be connected to a Revenue Cloud org with the demo data set up (Connection tab ›
 * Set up demo data). It changes demo records only: it applies a 20% discount on Acme's open
 * expansion quote and tries (and is refused) a 30% one.
 */
const APP = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const KEY = process.env.TOOLS_API_KEY;
if (!KEY) {
  console.error("Set TOOLS_API_KEY to the running app's tools API key.");
  process.exit(2);
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
};

async function tool(name, args) {
  const response = await fetch(`${APP}/api/tools/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify(args),
  });
  return response.json();
}

/** One chat turn, optionally confirming the card it proposes (with an approver if asked). */
async function chat(text, { confirm = false, approver } = {}) {
  const conversationId = `org-smoke-${crypto.randomUUID()}`;
  const post = async (body) => {
    const response = await fetch(`${APP}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId, ...body }) });
    return response.json();
  };
  const history = [];
  const first = await post({ kind: "message", text, history });
  if (!confirm || !first.pendingConfirmation) return { first, second: null };
  history.push({ role: "user", content: text }, { role: "assistant", content: first.message });
  const second = await post({ kind: "confirm", pending: first.pendingConfirmation, history, ...(approver ? { approverName: approver } : {}) });
  return { first, second };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // Read-only tools.
  const account = (await tool("find_account", { name: "Acme University" })).data?.[0];
  check("find_account finds the demo account", !!account?.id, account?.name);
  if (!account) return;

  const diagnosis = await tool("diagnose_product", { productName: "Cloud Pro" });
  const failing = diagnosis.data?.checks?.filter((c) => c.status === "fail") ?? [];
  check("diagnose_product: Cloud Pro is set up to price", diagnosis.ok && failing.length === 0, failing.map((c) => `${c.area}: ${c.detail}`).join("; ") || diagnosis.data?.likelyCause);

  const health = await tool("check_pricing_health", {});
  check("check_pricing_health runs", health.ok, health.data?.summary?.join(" "));

  const quotes = await tool("list_account_quotes", { accountId: account.id });
  const expansion = quotes.data?.find((q) => /Expansion \(demo\)/.test(q.name ?? "") && q.lines.some((l) => l.productName === "Cloud Pro"));
  check("list_account_quotes finds the demo expansion quote", !!expansion, expansion?.quoteNumber);
  if (!expansion) return;
  const line = expansion.lines.find((l) => l.productName === "Cloud Pro");

  const price = await tool("explain_price", { quoteLineId: line.quoteLineId });
  const unit = price.data?.lines?.[0]?.waterfall?.find((s) => s.step === "Unit price")?.amount;
  check("explain_price: the Cloud Pro line is priced", unit > 0, `unit price ${unit}`);

  const revenue = await tool("get_customer_revenue_360", { accountId: account.id });
  check("get_customer_revenue_360: Acme has ARR", revenue.ok && revenue.data.arr > 0, `ARR ${revenue.data?.arr}`);

  // Chat, through the model.
  await sleep(5000);
  const blocked = await chat(`Apply a 30% discount to the Cloud Pro line on quote ${expansion.quoteNumber}.`, { confirm: true });
  const refused = blocked.second?.trace?.some((t) => t.blocked) ?? false;
  check("chat: a 30% discount is refused by policy", refused, blocked.second?.message?.slice(0, 120) ?? blocked.first?.message?.slice(0, 120));

  await sleep(20000);
  const approved = await chat(`Apply a 20% discount to the Cloud Pro line on quote ${expansion.quoteNumber}.`, { confirm: true, approver: "Org Smoke Test" });
  const asked = approved.first?.pendingConfirmation?.summary?.requiresApproverName === true;
  const applied = approved.second?.trace?.some((t) => t.tool === "apply_discount" && !t.blocked) ?? false;
  check("chat: a 20% discount asks for an approver, then applies", asked && applied, approved.second?.message?.slice(0, 120) ?? approved.first?.message?.slice(0, 120));
  if (applied) {
    await sleep(5000);
    const after = await tool("explain_price", { quoteLineId: line.quoteLineId });
    const l = after.data?.lines?.[0];
    const net = l?.waterfall?.find((s) => s.step === "Net unit price")?.amount;
    const unitAfter = l?.waterfall?.find((s) => s.step === "Unit price")?.amount;
    check("Salesforce shows the 20% on the line", unitAfter > 0 && Math.abs(net - unitAfter * 0.8) < 0.01, `unit ${unitAfter}, net unit ${net}`);
  }
}

main()
  .catch((error) => check("org smoke test ran", false, error.message))
  .finally(() => {
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  });
