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

export async function POST(req: Request) {
  const raw = await req.text();
  const meta = await getMetaCreds();
  // Wajib signature sah (app secret Aazflo) — tiada mod relay di sini.
  if (!meta?.appSecret || !verifyWhatsAppSignature(raw, req.headers.get("x-hub-signature-256"), meta.appSecret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let payload: { object?: string; entry?: { id: string; messaging?: Messaging[] }[] };
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
