/**
 * Org checks: drive a running app's tools API and chat against the Salesforce org it's connected
 * to, and check each scenario's real outcome. Shared by `pnpm test:org` (scripts/org-smoke.ts)
 * and the Connection tab's "Run org checks" button (/api/org-checks).
 *
 * Needs the demo data (Connection tab › Set up demo data). Changes demo records only: it applies
 * a 20% discount on Acme's expansion quote and tries, and is refused, a 30% one.
 */
export type OrgCheck = { name: string; ok: boolean; detail: string };

type Options = { baseUrl: string; toolsKey: string; pauseMs?: number; onCheck?: (check: OrgCheck) => void };

export async function runOrgChecks({ baseUrl, toolsKey, pauseMs = 20000, onCheck }: Options): Promise<OrgCheck[]> {
  const base = baseUrl.replace(/\/$/, "");
  const results: OrgCheck[] = [];
  const check = (name: string, ok: boolean, detail = "") => {
    const result = { name, ok, detail };
    results.push(result);
    onCheck?.(result);
  };
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const tool = async (name: string, args: Record<string, unknown>) =>
    (await fetch(`${base}/api/tools/${name}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${toolsKey}` },
      body: JSON.stringify(args),
    })).json() as Promise<any>;

  /** One chat turn, optionally confirming the card it proposes (with an approver if asked). */
  const chat = async (text: string, approver?: string) => {
    const conversationId = `org-check-${crypto.randomUUID()}`;
    const post = async (body: Record<string, unknown>) =>
      (await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId, ...body }) })).json() as Promise<any>;
    const first = await post({ kind: "message", text, history: [] });
    if (!first.pendingConfirmation) return { first, second: null as any };
    const history = [{ role: "user", content: text }, { role: "assistant", content: first.message }];
    const second = await post({ kind: "confirm", pending: first.pendingConfirmation, history, ...(approver ? { approverName: approver } : {}) });
    return { first, second };
  };

  try {
    const account = (await tool("find_account", { name: "Acme University" })).data?.[0];
    check("find_account finds the demo account", !!account?.id, account?.name ?? "not found: run Set up demo data");
    if (!account) return results;

    const diagnosis = await tool("diagnose_product", { productName: "Cloud Pro" });
    const failing = (diagnosis.data?.checks ?? []).filter((c: any) => c.status === "fail");
    check("diagnose_product: Cloud Pro is set up to price", diagnosis.ok && failing.length === 0, failing.map((c: any) => `${c.area}: ${c.detail}`).join("; ") || diagnosis.data?.likelyCause || diagnosis.error?.message || "");

    const health = await tool("check_pricing_health", {});
    check("check_pricing_health runs", !!health.ok, health.data?.summary?.join(" ") ?? health.error?.message ?? "");

    const quotes = await tool("list_account_quotes", { accountId: account.id });
    const expansion = (quotes.data ?? []).find((q: any) => /Expansion \(demo\)/.test(q.name ?? "") && q.lines.some((l: any) => l.productName === "Cloud Pro"));
    check("list_account_quotes finds the demo expansion quote", !!expansion, expansion?.quoteNumber ?? "not found: run Set up demo data");
    if (!expansion) return results;
    const line = expansion.lines.find((l: any) => l.productName === "Cloud Pro");

    const price = await tool("explain_price", { quoteLineId: line.quoteLineId });
    const unit = price.data?.lines?.[0]?.waterfall?.find((s: any) => s.step === "Unit price")?.amount;
    check("explain_price: the Cloud Pro line is priced", unit > 0, `unit price ${unit}`);

    const revenue = await tool("get_customer_revenue_360", { accountId: account.id });
    check("get_customer_revenue_360: Acme has ARR", !!revenue.ok && revenue.data.arr > 0, `ARR ${revenue.data?.arr}`);

    await sleep(Math.min(pauseMs, 5000));
    const blocked = await chat(`Apply a 30% discount to the Cloud Pro line on quote ${expansion.quoteNumber}.`);
    const refused = (blocked.second?.trace ?? []).some((t: any) => t.blocked);
    check("chat: a 30% discount is refused by policy", refused, String(blocked.second?.message ?? blocked.first?.message ?? blocked.first?.error ?? "").slice(0, 160));

    await sleep(pauseMs);
    const approved = await chat(`Apply a 20% discount to the Cloud Pro line on quote ${expansion.quoteNumber}.`, "Org Check");
    const asked = approved.first?.pendingConfirmation?.summary?.requiresApproverName === true;
    const applied = (approved.second?.trace ?? []).some((t: any) => t.tool === "apply_discount" && !t.blocked);
    check("chat: a 20% discount asks for an approver, then applies", asked && applied, String(approved.second?.message ?? approved.first?.message ?? approved.first?.error ?? "").slice(0, 160));
    if (applied) {
      await sleep(5000);
      const after = await tool("explain_price", { quoteLineId: line.quoteLineId });
      const steps = after.data?.lines?.[0]?.waterfall ?? [];
      const net = steps.find((s: any) => s.step === "Net unit price")?.amount;
      const unitAfter = steps.find((s: any) => s.step === "Unit price")?.amount;
      check("Salesforce shows the 20% on the line", unitAfter > 0 && Math.abs(net - unitAfter * 0.8) < 0.01, `unit ${unitAfter}, net unit ${net}`);
    }
  } catch (error) {
    check("org checks ran", false, error instanceof Error ? error.message : String(error));
  }
  return results;
}
