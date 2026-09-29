import { after, NextResponse } from "next/server";
import { publicBaseUrl, slack, verifySlackRequest } from "../../../../lib/slack/api";
import { loadingView, openStart } from "../../../../lib/slack/flow";

export const runtime = "nodejs";
export const maxDuration = 60;

/** `/quickpick [quote number]`: opens the modal at once (trigger ids last 3 s), then fills it in. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySlackRequest(request, raw)) return new NextResponse("Invalid signature", { status: 401 });
  const form = new URLSearchParams(raw);
  const user = { teamId: form.get("team_id") ?? "", userId: form.get("user_id") ?? "" };
  const channel = form.get("channel_id") ?? undefined;
  const argument = (form.get("text") ?? "").trim();

  let viewId: string;
  try {
    const opened = await slack<{ view: { id: string } }>("views.open", {
      trigger_id: form.get("trigger_id"),
      view: loadingView(argument ? `Opening quote ${argument}…` : "Loading your recent quotes…", { k: "info", c: channel }),
    });
    viewId = opened.view.id;
  } catch (e) {
    return NextResponse.json({ response_type: "ephemeral", text: `Quick Pick couldn't open: ${e instanceof Error ? e.message : e}` });
  }

  after(() => openStart({ user, viewId, baseUrl: publicBaseUrl(request.url) }, argument, channel));
  return new NextResponse(null, { status: 200 });
}
