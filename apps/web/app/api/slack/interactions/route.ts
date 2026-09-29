import { after, NextResponse } from "next/server";
import { publicBaseUrl, slack, verifySlackRequest } from "../../../../lib/slack/api";
import {
  addBundle,
  checkStep,
  commit,
  loadingView,
  openQuote,
  saveStep,
  showBundles,
  showStep,
  showSummary,
} from "../../../../lib/slack/flow";
import type { Meta, QuoteRef } from "../../../../lib/slack/views";

export const runtime = "nodejs";
export const maxDuration = 60;

type Payload = {
  type: string;
  user: { id: string; team_id?: string };
  team?: { id: string };
  view?: { id: string; callback_id?: string; private_metadata?: string; state?: { values: Record<string, Record<string, never>> } };
  actions?: { action_id: string; value?: string; selected_option?: { value: string } }[];
};

const ok = () => new NextResponse(null, { status: 200 });

/** Every button, dropdown and submit in the Quick Pick modal. Acknowledge now; talk to Salesforce after. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySlackRequest(request, raw)) return new NextResponse("Invalid signature", { status: 401 });
  const payload = JSON.parse(new URLSearchParams(raw).get("payload") ?? "{}") as Payload;
  if (!payload.view || payload.view.callback_id !== "quickpick") return ok();

  const user = { teamId: payload.user.team_id ?? payload.team?.id ?? "", userId: payload.user.id };
  const ctx = { user, viewId: payload.view.id, baseUrl: publicBaseUrl(request.url) };
  const meta = JSON.parse(payload.view.private_metadata || '{"k":"info"}') as Meta;
  const ref: QuoteRef | null = "q" in meta && meta.q ? { q: meta.q, n: meta.n, c: meta.c } : null;
  const rootLineId = "r" in meta ? meta.r : "";

  if (payload.type === "view_submission") {
    const values = payload.view.state?.values ?? {};
    if (meta.k === "quote") {
      const quoteId = (values.quote?.v as { selected_option?: { value: string } } | undefined)?.selected_option?.value;
      if (!quoteId) return NextResponse.json({ response_action: "errors", errors: { quote: "Choose a quote." } });
      after(() => openQuote(ctx, quoteId, meta.c));
      return NextResponse.json({ response_action: "update", view: loadingView("Opening quote…", meta) });
    }
    if (meta.k === "step") {
      const errors = checkStep(meta, values);
      if (errors) return NextResponse.json({ response_action: "errors", errors });
      after(() => saveStep(ctx, meta, values));
      return NextResponse.json({ response_action: "update", view: loadingView("Saving to Salesforce and repricing…", meta) });
    }
    if (meta.k === "summary" && ref) {
      after(() => commit(ctx, ref, meta.r));
      return NextResponse.json({ response_action: "update", view: loadingView("Validating and updating the quote…", meta) });
    }
    return ok();
  }

  if (payload.type === "block_actions" && ref) {
    const action = payload.actions?.[0];
    const busy = (message: string) => slack("views.update", { view_id: ctx.viewId, view: loadingView(message, meta) }).catch(() => undefined);
    switch (action?.action_id) {
      case "open_bundle":
        after(async () => (await busy("Loading the bundle from Salesforce…"), showStep(ctx, ref, action.value ?? "", 0)));
        break;
      case "add_bundle":
        after(async () => (await busy("Adding the bundle…"), addBundle(ctx, ref, action.selected_option?.value ?? "")));
        break;
      case "back":
        after(async () => (await busy("Loading…"), showStep(ctx, ref, rootLineId, Number(action.value ?? 0))));
        break;
      case "to_summary":
        after(async () => (await busy("Validating the configuration…"), showSummary(ctx, ref, rootLineId)));
        break;
      case "to_bundles":
        after(async () => (await busy("Loading the quote…"), showBundles(ctx, ref)));
        break;
    }
  }
  return ok();
}
