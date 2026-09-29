import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { del, get, put } from "@vercel/blob";
import type { StoredSession } from "../salesforceSession";

/**
 * Each Slack user signs in to Salesforce once; their session is kept server-side, keyed by Slack
 * team and user, in a private Vercel Blob store. Sessions are AES-256-GCM encrypted with a key
 * derived from SLACK_LINK_SECRET, so the store never holds a readable token.
 */
export type SlackUser = { teamId: string; userId: string };

function key(purpose: string): Buffer {
  const secret = process.env.SLACK_LINK_SECRET;
  if (!secret) throw new Error("SLACK_LINK_SECRET is not configured.");
  return createHash("sha256").update(`${purpose}:${secret}`).digest();
}

function pathFor(user: SlackUser): string {
  // Hash the ids so the store's listing doesn't reveal who has linked.
  const id = createHmac("sha256", key("path")).update(`${user.teamId}:${user.userId}`).digest("hex");
  return `slack-links/${id}.bin`;
}

function encrypt(session: StoredSession): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("enc"), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

function decrypt(data: Buffer): StoredSession | null {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key("enc"), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    const text = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(text) as StoredSession;
  } catch {
    return null;
  }
}

export async function saveLink(user: SlackUser, session: StoredSession): Promise<void> {
  await put(pathFor(user), encrypt(session), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/octet-stream",
  });
}

export async function loadLink(user: SlackUser): Promise<StoredSession | null> {
  const result = await get(pathFor(user), { access: "private", useCache: false }).catch(() => null);
  if (!result || result.statusCode !== 200) return null;
  return decrypt(Buffer.from(await new Response(result.stream).arrayBuffer()));
}

export async function deleteLink(user: SlackUser): Promise<void> {
  await del(pathFor(user)).catch(() => undefined);
}

/**
 * The "Connect Salesforce" button carries a short-lived signed ticket naming the Slack user, so
 * whoever completes the sign-in is linked to the Slack account that asked, and nobody else.
 */
export function signLinkTicket(user: SlackUser, ttlSeconds = 900): string {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  const mac = createHmac("sha256", key("ticket")).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifyLinkTicket(ticket: string | null): SlackUser | null {
  if (!ticket) return null;
  const [payload, mac] = ticket.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(createHmac("sha256", key("ticket")).update(payload).digest("base64url"));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { teamId, userId, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof exp !== "number" || exp < Date.now() / 1000) return null;
    return typeof teamId === "string" && typeof userId === "string" ? { teamId, userId } : null;
  } catch {
    return null;
  }
}
