import type { ConfigurationGroup, ConfigurationState } from "@revenue-picker/core";
import type { BridgeProduct, BridgeQuoteBundle } from "@revenue-picker/salesforce-revenue";
import type { QuoteRow } from "./salesforce";

/**
 * Block Kit for the Slack Quick Pick flow. Every modal carries its position in `private_metadata`,
 * so each request is stateless: the next step is rebuilt from Salesforce, never from memory.
 */
type Block = Record<string, unknown>;
export type View = Record<string, unknown>;

export type QuoteRef = { q: string; n: string; c?: string };
/** Step metadata. `sel`/`qty`/`att` are what the step showed, so a submission can be diffed without a round trip. */
export type StepMeta = QuoteRef & {
  k: "step";
  r: string;
  i: number;
  g: string;
  min: number;
  max: number | null;
  sel: string[];
  qty: Record<string, number>;
  att: Record<string, string>;
  dis: string[];
  more?: string[];
};
export type Meta =
  | (QuoteRef & { k: "quote" })
  | (QuoteRef & { k: "bundles" })
  | StepMeta
  | (QuoteRef & { k: "summary"; r: string; i: number })
  | { k: "info"; c?: string };

const MAX_OPTIONS_FOR_CHECKBOXES = 10;

const text = (value: string, max = 3000) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
const plain = (value: string, max = 75) => ({ type: "plain_text", text: text(value, max), emoji: true });
const md = (value: string) => ({ type: "mrkdwn", text: text(value) });

export function money(amount: number | undefined | null, currency = "EUR"): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(amount);
}

function modal(title: string, blocks: Block[], meta: Meta, submit?: string, close = "Close"): View {
  return {
    type: "modal",
    callback_id: "quickpick",
    title: plain(title, 24),
    ...(submit ? { submit: plain(submit, 24) } : {}),
    close: plain(close, 24),
    private_metadata: JSON.stringify(meta),
    blocks,
  };
}

export function loadingView(message: string, meta: Meta = { k: "info" }): View {
  return modal("Quick Pick", [{ type: "section", text: md(`:hourglass_flowing_sand: ${message}`) }], meta);
}

export function messageView(title: string, message: string, meta: Meta = { k: "info" }, actions: Block[] = []): View {
  return modal(title, [{ type: "section", text: md(message) }, ...(actions.length ? [{ type: "actions", elements: actions }] : [])], meta);
}

export function connectView(url: string): View {
  return messageView(
    "Connect Salesforce",
    "Quick Pick works on your Revenue Cloud quotes as *you*, so it needs your Salesforce sign-in once.\n\nAfter signing in, run `/quickpick` again.",
    { k: "info" },
    [{ type: "button", text: plain("Sign in with Salesforce"), url, style: "primary", action_id: "connect" }]
  );
}

export function quoteChooserView(quotes: QuoteRow[], channel?: string): View {
  const options = quotes.map((q) => ({
    text: plain(`${q.QuoteNumber} · ${q.Name}${q.Account?.Name ? ` · ${q.Account.Name}` : ""}`),
    value: q.Id,
  }));
  return modal(
    "Quick Pick",
    [
      { type: "section", text: md("Pick a quote to configure. Tip: `/quickpick 49` opens quote 00000049 directly.") },
      {
        type: "input",
        block_id: "quote",
        label: plain("Quote"),
        element: { type: "static_select", action_id: "v", placeholder: plain("Recent quotes"), options },
      },
    ],
    { k: "quote", q: "", n: "", c: channel },
    "Open"
  );
}

export function bundlesView(ref: QuoteRef, bundles: BridgeQuoteBundle[], catalog: BridgeProduct[], instanceUrl: string): View {
  const currency = bundles[0]?.currencyIsoCode ?? "EUR";
  const total = bundles.reduce((sum, b) => sum + (b.netTotal ?? 0), 0);
  const blocks: Block[] = [
    {
      type: "section",
      text: md(`*Quote <${instanceUrl}/lightning/r/Quote/${ref.q}/view|${ref.n}>* · ${bundles.length} bundle${bundles.length === 1 ? "" : "s"} · ${money(total, currency)}`),
    },
    { type: "divider" },
  ];
  for (const b of bundles.slice(0, 40)) {
    blocks.push({
      type: "section",
      text: md(`*${b.name}*${b.quantity > 1 ? ` ×${b.quantity}` : ""}\n${b.componentCount} components · ${money(b.netTotal, b.currencyIsoCode ?? currency)}`),
      accessory: { type: "button", text: plain("Configure"), action_id: "open_bundle", value: b.rootLineId },
    });
  }
  if (!bundles.length) blocks.push({ type: "section", text: md("_No bundles on this quote yet._") });
  if (catalog.length) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      block_id: "add",
      text: md("*Add a bundle*"),
      accessory: {
        type: "static_select",
        action_id: "add_bundle",
        placeholder: plain("Choose a product"),
        options: catalog.slice(0, 100).map((p) => ({ text: plain(p.Name), value: p.Id })),
      },
    });
  }
  return modal("Quick Pick", blocks, { k: "bundles", q: ref.q, n: ref.n, c: ref.c });
}

function ruleText(group: ConfigurationGroup): string {
  const { min, max } = group.cardinality;
  if (max === 1) return min >= 1 ? "choose 1" : "choose up to 1";
  if (max == null) return min > 0 ? `choose at least ${min}` : "optional";
  if (min === max) return `choose ${min}`;
  return min > 0 ? `choose ${min}–${max}` : `choose up to ${max}`;
}

function progress(state: ConfigurationState, index: number): string {
  return state.groups.map((g, i) => (i === index ? "●" : g.status === "complete" ? "✓" : "○")).join(" ");
}

/**
 * One component group. Checkboxes for every group (a radio can't be cleared, and "choose 1" still
 * needs a way to deselect); a multi-select beyond Slack's ten-checkbox limit. Quantity and picklist
 * attributes appear for options that are already on the quote.
 */
export function stepView(ref: QuoteRef, state: ConfigurationState, index: number, currency: string, error?: string): View {
  const group = state.groups[index];
  if (!group) return messageView("Quick Pick", `${state.rootProductName} has no component groups to configure.`, { k: "bundles", ...ref });
  const selected = group.options.filter((o) => o.selected);
  const isLast = index === state.groups.length - 1;

  const describe = (o: (typeof group.options)[number]) =>
    [money(o.listPrice, currency), o.disabled ? `Unavailable${o.notice ? `: ${o.notice}` : ""}` : null].filter(Boolean).join(" · ");
  const options = group.options.map((o) => ({
    text: plain(o.name),
    value: o.id,
    ...(group.options.length <= MAX_OPTIONS_FOR_CHECKBOXES ? { description: plain(describe(o)) } : {}),
  }));
  const initial = options.filter((o) => selected.some((s) => s.id === o.value));

  const blocks: Block[] = [
    { type: "context", elements: [md(`${state.rootProductName} · step ${index + 1} of ${state.groups.length}   ${progress(state, index)}`)] },
    {
      type: "section",
      text: md(`*${group.label}* — ${ruleText(group)} · ${selected.length} of ${group.options.length} selected`),
    },
  ];
  if (error) blocks.push({ type: "section", text: md(`:warning: ${error}`) });
  for (const notice of state.notices ?? []) blocks.push({ type: "context", elements: [md(`:information_source: ${notice}`)] });

  blocks.push({
    type: "input",
    block_id: "opts",
    optional: true,
    label: plain("Options"),
    element:
      group.options.length <= MAX_OPTIONS_FOR_CHECKBOXES
        ? { type: "checkboxes", action_id: "v", options, ...(initial.length ? { initial_options: initial } : {}) }
        : { type: "multi_static_select", action_id: "v", placeholder: plain("Choose"), options, ...(initial.length ? { initial_options: initial } : {}) },
  });

  const qty: Record<string, number> = {};
  const att: Record<string, string> = {};
  for (const o of selected) {
    if (o.quantityEditable) {
      qty[o.id] = o.quantity ?? 1;
      blocks.push({
        type: "input",
        block_id: `qty:${o.id}`,
        label: plain(`${o.name} — quantity`),
        element: {
          type: "number_input",
          action_id: "v",
          is_decimal_allowed: false,
          initial_value: String(o.quantity ?? 1),
          ...(o.minQuantity != null ? { min_value: String(o.minQuantity) } : {}),
          ...(o.maxQuantity != null ? { max_value: String(o.maxQuantity) } : {}),
        },
      });
    }
    for (const a of o.attributes) {
      const values = a.controlType === "boolean" ? [{ code: "true", label: "Yes" }, { code: "false", label: "No" }] : (a.validValues ?? []);
      if (!values.length || (a.controlType !== "picklist" && a.controlType !== "boolean")) continue;
      const current = a.currentValue == null ? null : String(a.currentValue);
      if (current) att[`${o.id}|${a.id}`] = current;
      const choices = values.slice(0, 100).map((v) => ({ text: plain(v.label), value: v.code }));
      const init = choices.find((c) => c.value === current);
      blocks.push({
        type: "input",
        block_id: `att:${o.id}|${a.id}`,
        optional: !a.required,
        label: plain(`${o.name} — ${a.label}`),
        element: { type: "static_select", action_id: "v", placeholder: plain("Choose"), options: choices, ...(init ? { initial_option: init } : {}) },
      });
    }
  }

  const nav: Block[] = [{ type: "button", text: plain("All bundles"), action_id: "to_bundles" }];
  if (index > 0) nav.unshift({ type: "button", text: plain("← Back"), action_id: "back", value: String(index - 1) });
  nav.push({ type: "button", text: plain("Review"), action_id: "to_summary" });
  blocks.push({ type: "actions", elements: nav });

  const meta: StepMeta = {
    k: "step",
    q: ref.q,
    n: ref.n,
    c: ref.c,
    r: state.sessionId.split(":")[1] ?? "",
    i: index,
    g: group.id,
    min: group.cardinality.min,
    max: group.cardinality.max,
    sel: selected.map((o) => o.id),
    qty,
    att,
    dis: group.options.filter((o) => o.disabled).map((o) => o.id),
    more: group.options.filter((o) => o.attributes.length).map((o) => o.id),
  };
  return modal(text(group.label, 24), blocks, meta, isLast ? "Review" : "Next", "Close");
}

export type SummaryLine = { name: string; quantity: number; amount: number };

export function summaryView(
  ref: QuoteRef & { r: string },
  state: ConfigurationState,
  total: number | null,
  currency: string,
  issues: string[]
): View {
  const lines = state.groups.map((g) => {
    const chosen = g.options.filter((o) => o.selected);
    const names = chosen.map((o) => `${o.name}${(o.quantity ?? 1) > 1 ? ` ×${o.quantity}` : ""}`).join(", ");
    return `${g.status === "complete" ? "✓" : ":warning:"} *${g.label}:* ${names || "_none_"}`;
  });
  const blocks: Block[] = [
    { type: "section", text: md(`*${state.rootProductName}* on quote ${ref.n}`) },
    { type: "section", text: md(lines.join("\n")) },
    { type: "divider" },
    { type: "section", text: md(`*Bundle total:* ${money(total, currency)}`) },
  ];
  if (issues.length) blocks.push({ type: "section", text: md(`:no_entry: *Not ready*\n${issues.map((i) => `• ${i}`).join("\n")}`) });
  blocks.push({
    type: "actions",
    elements: [
      { type: "button", text: plain("← Back"), action_id: "back", value: String(state.groups.length - 1) },
      { type: "button", text: plain("All bundles"), action_id: "to_bundles" },
    ],
  });
  return modal("Review", blocks, { k: "summary", q: ref.q, n: ref.n, c: ref.c, r: ref.r, i: state.groups.length - 1 }, issues.length ? undefined : "Update Quote");
}
