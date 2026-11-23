import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { verifyWhatsAppSignature } from "@/lib/whatsapp";
import { getMetaInbox, fetchMetaProfileName } from "@/lib/meta-inbox";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { runBotForContact } from "@/lib/inbox-bot";

export const dynamic = "force-dynamic";

// Webhook Messenger (object=page) + Instagram DM (object=instagram) — app Aazflo.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const { verifyToken } = await getMetaInbox();
  if (
    url.searchParams.get("hub.mode") === "subscribe" &&
    verifyToken &&
    url.searchParams.get("hub.verify_token") === verifyToken
  ) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

type Messaging = {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: { type?: string }[]; quick_reply?: { payload?: string } };
  postback?: { title?: string; payload?: string };
};

// Komen: FB page `feed` (item=comment, verb=add) · IG `comments`
type Change = {
  field?: string;
  value?: {
    // FB feed
    item?: string;
    verb?: string;
    comment_id?: string;
    post_id?: string;
    parent_id?: string;
    message?: string;
    created_time?: number;
    // IG comments
    id?: string;
    text?: string;
    media?: { id?: string; media_product_type?: string };
    from?: { id?: string; name?: string; username?: string };
  };
};

async function ingestComment(
  channel: "fb_comment" | "ig_comment",
  ownerId: string, // page id (FB) / IG account id
  c: { commentId: string; fromId: string; fromName: string | null; text: string; when: Date },
): Promise<{ contactId: string; msgId: string } | null> {
  if (await db.waMessage.findUnique({ where: { waMsgId: c.commentId }, select: { id: true } })) return null;
  const key = (channel === "ig_comment" ? "igc:" : "fbc:") + c.fromId;
  let contact = await db.waContact.findUnique({ where: { waId: key } });
  if (!contact) {
    contact = await db.waContact.create({ data: { waId: key, channel, pageId: ownerId, name: c.fromName } });
  }
  const saved = await db.waMessage.create({
    data: { contactId: contact.id, waMsgId: c.commentId, direction: "in", type: "comment", body: c.text, timestamp: c.when },
  });
  await db.waContact.update({
    where: { id: contact.id },
    data: { lastMessageAt: c.when, lastInboundAt: c.when, unread: { increment: 1 }, archived: false, pageId: ownerId },
  });
  return { contactId: contact.id, msgId: saved.id };
}

export async function POST(req: Request) {
  const raw = await req.text();
  const meta = await getMetaCreds();
  // Wajib signature sah (app secret Aazflo) — tiada mod relay di sini.
  if (!meta?.appSecret || !verifyWhatsAppSignature(raw, req.headers.get("x-hub-signature-256"), meta.appSecret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let payload: { object?: string; entry?: { id: string; messaging?: Messaging[]; changes?: Change[] }[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  const channel = payload.object === "instagram" ? "instagram" : payload.object === "page" ? "messenger" : null;
  if (!channel) return NextResponse.json({ ok: true, ignored: payload.object });
  const prefix = channel === "instagram" ? "ig:" : "fb:";

  const botQueue = new Map<string, string>();
  let ingested = 0;

  // ── Komen (changes) ──
  for (const entry of payload.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      const v = ch.value ?? {};
      try {
        if (channel === "messenger" && ch.field === "feed" && v.item === "comment" && v.verb === "add") {
          // Abaikan komen page sendiri (balasan bot/staff) & komen kosong
          if (!v.comment_id || !v.from?.id || v.from.id === entry.id || !v.message?.trim()) continue;
          const r = await ingestComment("fb_comment", entry.id, {
            commentId: v.comment_id,
            fromId: v.from.id,
            fromName: v.from.name ?? null,
            text: v.message,
            when: new Date((v.created_time ?? Date.now() / 1000) * 1000),
          });
          if (r) (botQueue.set(r.contactId, r.msgId), ingested++);
        } else if (channel === "instagram" && ch.field === "comments") {
          if (!v.id || !v.from?.id || v.from.id === entry.id || !v.text?.trim()) continue;
          const r = await ingestComment("ig_comment", entry.id, {
            commentId: v.id,
            fromId: v.from.id,
            fromName: v.from.username ? "@" + v.from.username : null,
            text: v.text,
            when: new Date(),
          });
          if (r) (botQueue.set(r.contactId, r.msgId), ingested++);
        }
      } catch (e) {
        console.error("[meta-webhook] komen", e);
      }
    }
  }

  for (const entry of payload.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      const msg = ev.message;
      const isEcho = !!msg?.is_echo;
      // Echo = mesej dari page (API kita, atau staff balas di Meta Business Suite)
      const userId = isEcho ? ev.recipient?.id : ev.sender?.id;
      const pageId = isEcho ? ev.sender?.id : ev.recipient?.id;
      if (!userId || !pageId) continue;
      const when = new Date(ev.timestamp ?? Date.now());
      const mid = msg?.mid ?? null;
      const text =
        msg?.text ??
        (ev.postback?.title || null) ??
        (msg?.attachments?.length ? `📎 ${msg.attachments[0].type ?? "lampiran"}` : null);
      if (!text) continue;
      const type = msg?.text ? "text" : ev.postback ? "button" : (msg?.attachments?.[0]?.type ?? "attachment");

      try {
        if (mid && (await db.waMessage.findUnique({ where: { waMsgId: mid }, select: { id: true } }))) continue; // dah ada

        const key = prefix + userId;
        let contact = await db.waContact.findUnique({ where: { waId: key } });
        if (!contact) {
          const name = await fetchMetaProfileName(channel, pageId, userId);
          contact = await db.waContact.create({ data: { waId: key, channel, pageId, name } });
        }

        if (isEcho) {
          // Staff balas dari Meta inbox → simpan & bot berhenti untuk kontak ni
          await db.waMessage.create({
            data: { contactId: contact.id, waMsgId: mid, direction: "out", type, body: text, status: "sent", timestamp: when },
          });
          await db.waContact.update({ where: { id: contact.id }, data: { lastMessageAt: when, botPaused: true } });
          continue;
        }

        const saved = await db.waMessage.create({
          data: { contactId: contact.id, waMsgId: mid, direction: "in", type, body: text, timestamp: when },
        });
        await db.waContact.update({
          where: { id: contact.id },
          data: { lastMessageAt: when, lastInboundAt: when, unread: { increment: 1 }, archived: false, pageId },
        });
        botQueue.set(contact.id, saved.id);
        ingested++;
      } catch (e) {
        console.error("[meta-webhook]", e);
      }
    }
  }

  for (const [cid, mid] of botQueue) {
    after(() => runBotForContact(cid, mid).catch((e) => console.error("[inbox-bot]", e)));
  }
  return NextResponse.json({ ok: true, ingested });
}
