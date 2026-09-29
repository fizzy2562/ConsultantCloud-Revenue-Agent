import type { ConfigurationChange, ConfigurationState } from "@revenue-picker/core";
import { slack } from "./api";
import { signLinkTicket, type SlackUser } from "./links";
import { NotLinkedError, salesforceFor, type SalesforceForSlack } from "./salesforce";
import {
  bundlesView,
  connectView,
  loadingView,
  messageView,
  money,
  quoteChooserView,
  stepView,
  summaryView,
  type QuoteRef,
  type StepMeta,
  type View,
} from "./views";

type Ctx = { user: SlackUser; viewId: string; baseUrl: string };

async function update(viewId: string, view: View): Promise<void> {
  await slack("views.update", { view_id: viewId, view });
}

/** Runs one background step, turning failures into a readable modal instead of a stuck spinner. */
async function run(ctx: Ctx, work: (sf: SalesforceForSlack) => Promise<View>, back?: QuoteRef): Promise<void> {
  let view: View;
  try {
    view = await work(await salesforceFor(ctx.user));
  } catch (e) {
    if (e instanceof NotLinkedError) {
      view = connectView(`${ctx.baseUrl}/api/auth/login?target=revenue&slack=${encodeURIComponent(signLinkTicket(ctx.user))}`);
    } else {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[slack quickpick]", message);
      view = messageView(
        "Quick Pick",
        `:warning: Salesforce said: ${message}`,
        back ? { k: "bundles", ...back } : { k: "info" },
        back ? [{ type: "button", text: { type: "plain_text", text: "All bundles" }, action_id: "to_bundles" }] : []
      );
    }
  }
  await update(ctx.viewId, view).catch((e) => console.error("[slack quickpick] views.update", e));
}

async function currencyFor(sf: SalesforceForSlack, state: ConfigurationState): Promise<{ currency: string; total: number | null }> {
  const pricing = await sf.adapter.getPricing(state.sessionId);
  if (!pricing.ok) return { currency: "EUR", total: null };
  return { currency: pricing.data.currencyIsoCode, total: Number(pricing.data.totalPrice) };
}

async function loadState(sf: SalesforceForSlack, ref: QuoteRef, rootLineId: string): Promise<ConfigurationState> {
  const result = await sf.adapter.getState(`${ref.q}:${rootLineId}`);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

// ---- screens -------------------------------------------------------------------------------

export function openStart(ctx: Ctx, argument: string, channel?: string) {
  return run(ctx, async (sf) => {
    if (argument) {
      const quote = await sf.findQuote(argument);
      if (!quote) return messageView("Quick Pick", `No quote matches \`${argument}\`. Run \`/quickpick\` to choose from recent quotes.`);
      return bundles(sf, { q: quote.Id, n: quote.QuoteNumber, c: channel });
    }
    const quotes = await sf.recentQuotes();
    if (!quotes.length) return messageView("Quick Pick", "No quotes found in Salesforce.");
    return quoteChooserView(quotes, channel);
  });
}

async function bundles(sf: SalesforceForSlack, ref: QuoteRef): Promise<View> {
  const [onQuote, catalog] = await Promise.all([sf.bridge.getQuoteBundles!(ref.q), sf.bridge.getActiveBundles()]);
  return bundlesView(ref, onQuote, catalog, sf.instanceUrl());
}

export function showBundles(ctx: Ctx, ref: QuoteRef) {
  return run(ctx, (sf) => bundles(sf, ref), ref);
}

export function openQuote(ctx: Ctx, quoteId: string, channel?: string) {
  return run(ctx, async (sf) => {
    const quote = await sf.findQuote(quoteId);
    if (!quote) return messageView("Quick Pick", "That quote no longer exists.");
    return bundles(sf, { q: quote.Id, n: quote.QuoteNumber, c: channel });
  });
}

export function showStep(ctx: Ctx, ref: QuoteRef, rootLineId: string, index: number) {
  return run(
    ctx,
    async (sf) => {
      const state = await loadState(sf, ref, rootLineId);
      const { currency } = await currencyFor(sf, state);
      return stepView(ref, state, Math.min(Math.max(index, 0), state.groups.length - 1), currency);
    },
    ref
  );
}

/** "Add a bundle": find-or-create the root line through the same Apex path the Lightning page uses. */
export function addBundle(ctx: Ctx, ref: QuoteRef, productId: string) {
  return run(
    ctx,
    async (sf) => {
      const result = await sf.adapter.startSession({ quoteId: ref.q, productId });
      if (!result.ok) throw new Error(result.error.message);
      const { currency } = await currencyFor(sf, result.data);
      return stepView(ref, result.data, 0, currency);
    },
    ref
  );
}

// ---- a step's Next ------------------------------------------------------------------------

type Values = Record<string, Record<string, { selected_options?: { value: string }[]; selected_option?: { value: string } | null; value?: string | null }>>;

/** Slack-side rules check. Returns `response_action: errors` payload, or null when the step may be saved. */
export function checkStep(meta: StepMeta, values: Values): Record<string, string> | null {
  const chosen = (values.opts?.v?.selected_options ?? []).map((o) => o.value);
  const errors: Record<string, string> = {};
  if (chosen.length < meta.min) errors.opts = meta.min === 1 ? "Choose one option." : `Choose at least ${meta.min} options.`;
  else if (meta.max != null && chosen.length > meta.max) errors.opts = meta.max === 1 ? "Choose only one option." : `Choose at most ${meta.max} options.`;
  const blocked = chosen.filter((id) => meta.dis.includes(id) && !meta.sel.includes(id));
  if (blocked.length) errors.opts = "A configuration rule blocks one of the options you ticked.";
  return Object.keys(errors).length ? errors : null;
}

function diff(meta: StepMeta, values: Values): { changes: ConfigurationChange[]; added: string[] } {
  const chosen = (values.opts?.v?.selected_options ?? []).map((o) => o.value);
  const groupId = meta.g;
  const removed = meta.sel.filter((id) => !chosen.includes(id));
  const added = chosen.filter((id) => !meta.sel.includes(id));
  const changes: ConfigurationChange[] = [
    // Deselect first, so swapping the one option in a "choose 1" group never holds two at once.
    ...removed.map((optionId) => ({ type: "deselect-option" as const, groupId, optionId })),
    ...added.map((optionId) => ({ type: "select-option" as const, groupId, optionId })),
  ];
  for (const [optionId, before] of Object.entries(meta.qty)) {
    const raw = values[`qty:${optionId}`]?.v?.value;
    const quantity = raw == null ? NaN : Number(raw);
    if (chosen.includes(optionId) && Number.isInteger(quantity) && quantity !== before) {
      changes.push({ type: "set-quantity", groupId, optionId, quantity });
    }
  }
  for (const [blockId, block] of Object.entries(values)) {
    if (!blockId.startsWith("att:")) continue;
    const [optionId = "", attributeId = ""] = blockId.slice(4).split("|");
    const value = block.v?.selected_option?.value ?? null;
    if (chosen.includes(optionId) && value != null && value !== meta.att[`${optionId}|${attributeId}`]) {
      changes.push({ type: "set-attribute", groupId, optionId, attributeId, value });
    }
  }
  return { changes, added };
}

export function saveStep(ctx: Ctx, meta: StepMeta, values: Values) {
  const ref: QuoteRef = { q: meta.q, n: meta.n, c: meta.c };
  return run(
    ctx,
    async (sf) => {
      const { changes, added } = diff(meta, values);
      const sessionId = `${meta.q}:${meta.r}`;
      if (changes.length) {
        const result = await sf.adapter.applyChanges!(sessionId, changes);
        if (!result.ok) {
          // The engine refused: show the step as Salesforce now has it, with its reason.
          const state = await loadState(sf, ref, meta.r);
          const { currency } = await currencyFor(sf, state);
          return stepView(ref, state, meta.i, currency, result.error.message);
        }
        const state = result.data;
        const { currency, total } = await currencyFor(sf, state);
        // Newly added options with attributes: stay so they can be set before moving on.
        if (added.some((id) => meta.more?.includes(id))) {
          return stepView(ref, state, meta.i, currency, "Added — set the options for the new items, then Next.");
        }
        return meta.i + 1 < state.groups.length ? stepView(ref, state, meta.i + 1, currency) : review(sf, ref, meta.r, state, total, currency);
      }
      const state = await loadState(sf, ref, meta.r);
      const { currency, total } = await currencyFor(sf, state);
      return meta.i + 1 < state.groups.length ? stepView(ref, state, meta.i + 1, currency) : review(sf, ref, meta.r, state, total, currency);
    },
    ref
  );
}

// ---- review and Update Quote --------------------------------------------------------------

async function review(sf: SalesforceForSlack, ref: QuoteRef, rootLineId: string, state?: ConfigurationState, total?: number | null, currency?: string): Promise<View> {
  const sessionId = `${ref.q}:${rootLineId}`;
  const validation = await sf.adapter.validateTransaction(sessionId);
  if (!validation.ok) throw new Error(validation.error.message);
  const current = state ?? (await loadState(sf, ref, rootLineId));
  const priced = total === undefined || !currency ? await currencyFor(sf, current) : { total, currency };
  const issues = validation.data.valid ? [] : validation.data.issues.map((i) => i.message);
  return summaryView({ ...ref, r: rootLineId }, current, priced.total, priced.currency, issues);
}

export function showSummary(ctx: Ctx, ref: QuoteRef, rootLineId: string) {
  return run(ctx, (sf) => review(sf, ref, rootLineId), ref);
}

export function commit(ctx: Ctx, ref: QuoteRef, rootLineId: string) {
  return run(
    ctx,
    async (sf) => {
      const sessionId = `${ref.q}:${rootLineId}`;
      const validation = await sf.adapter.validateTransaction(sessionId);
      if (!validation.ok) throw new Error(validation.error.message);
      if (!validation.data.valid) return review(sf, ref, rootLineId);

      const [quote, state] = await Promise.all([sf.adapter.createQuote(sessionId), loadState(sf, ref, rootLineId)]);
      if (!quote.ok) throw new Error(quote.error.message);
      const { currency } = await currencyFor(sf, state);
      const link = `${sf.instanceUrl()}/lightning/r/Quote/${ref.q}/view`;
      const total = money(Number(quote.data.totalPrice), currency);
      const summary = state.groups
        .map((g) => g.options.filter((o) => o.selected).map((o) => o.name).join(", "))
        .filter(Boolean)
        .join(" · ");

      const message = {
        text: `<@${ctx.user.userId}> configured ${state.rootProductName} on quote ${quote.data.quoteNumber} — quote total ${total}`,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `:white_check_mark: <@${ctx.user.userId}> configured *${state.rootProductName}* on quote *<${link}|${quote.data.quoteNumber}>*` } },
          { type: "context", elements: [{ type: "mrkdwn", text: summary.slice(0, 2900) || "—" }] },
          { type: "section", text: { type: "mrkdwn", text: `*Quote total:* ${total} · ${quote.data.status}` } },
        ],
      };
      // Post where /quickpick was run; fall back to a DM when the bot can't post there.
      const posted = ref.c ? await slack("chat.postMessage", { channel: ref.c, ...message }).then(() => true, () => false) : false;
      if (!posted) await slack("chat.postMessage", { channel: ctx.user.userId, ...message }).catch(() => undefined);

      return messageView(
        "Quote updated",
        `:white_check_mark: *${state.rootProductName}* saved on quote <${link}|${quote.data.quoteNumber}>.\nQuote total: *${total}*`,
        { k: "bundles", ...ref },
        [
          { type: "button", text: { type: "plain_text", text: "All bundles" }, action_id: "to_bundles" },
          { type: "button", text: { type: "plain_text", text: "Open in Salesforce" }, url: link, action_id: "open_sf" },
        ]
      );
    },
    ref
  );
}

export { loadingView };
