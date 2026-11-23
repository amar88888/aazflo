import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWhatsAppConfig, verifyWhatsAppSignature } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

// Webhook WhatsApp Cloud API.
//   GET  — pengesahan langganan Meta (hub.challenge)
//   POST — terima mesej masuk + kemaskini status (sent/delivered/read)

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const cfg = await getWhatsAppConfig();
  const expected = cfg?.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && token && expected && token === expected) {
    return new Response(challenge ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

type WaWebhookMsg = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  button?: { text: string };
  interactive?: {
    button_reply?: { title: string };
    list_reply?: { title: string };
  };
  image?: { id: string; caption?: string };
  video?: { id: string; caption?: string };
  audio?: { id: string };
  document?: { id: string; filename?: string; caption?: string };
  sticker?: { id: string };
};

function readBody(m: WaWebhookMsg): { body: string; mediaId: string | null } {
  switch (m.type) {
    case "text":
      return { body: m.text?.body ?? "", mediaId: null };
    case "button":
      return { body: m.button?.text ?? "(butang)", mediaId: null };
    case "interactive":
      return {
        body: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "(interaktif)",
        mediaId: null,
      };
    case "image":
      return { body: m.image?.caption ? `📷 ${m.image.caption}` : "📷 Gambar", mediaId: m.image?.id ?? null };
    case "video":
      return { body: m.video?.caption ? `🎥 ${m.video.caption}` : "🎥 Video", mediaId: m.video?.id ?? null };
    case "audio":
      return { body: "🎙️ Audio", mediaId: m.audio?.id ?? null };
    case "document":
      return { body: `📄 ${m.document?.filename ?? "Dokumen"}`, mediaId: m.document?.id ?? null };
    case "sticker":
      return { body: "🩵 Sticker", mediaId: m.sticker?.id ?? null };
    default:
      return { body: `(${m.type})`, mediaId: null };
  }
}

const tsToDate = (s: string) => new Date((parseInt(s, 10) || Math.floor(Date.now() / 1000)) * 1000);

export async function POST(req: Request) {
  const raw = await req.text();
  const cfg = await getWhatsAppConfig();

  // Sahkan signature (kalau App Secret diset)
  const sig = req.headers.get("x-hub-signature-256");
  if (!verifyWhatsAppSignature(raw, sig, cfg?.appSecret)) {
    return NextResponse.json({ ok: false, message: "bad signature" }, { status: 401 });
  }

  let payload: {
    entry?: {
      changes?: {
        value?: {
          contacts?: { profile?: { name?: string }; wa_id: string }[];
          messages?: WaWebhookMsg[];
          statuses?: { id: string; status: string; timestamp: string; errors?: { title?: string }[] }[];
        };
      }[];
    }[];
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, ping: true });
  }

  let ingested = 0;
  let statusUpdated = 0;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v) continue;
      const nameByWaId = new Map<string, string>();
      for (const c of v.contacts ?? []) if (c.profile?.name) nameByWaId.set(c.wa_id, c.profile.name);

      // Mesej MASUK
      for (const m of v.messages ?? []) {
        const waId = m.from;
        const when = tsToDate(m.timestamp);
        const { body, mediaId } = readBody(m);
        const name = nameByWaId.get(waId);
        try {
          const contact = await db.waContact.upsert({
            where: { waId },
            update: { name: name ?? undefined, lastMessageAt: when, lastInboundAt: when, unread: { increment: 1 }, archived: false },
            create: { waId, name: name ?? null, lastMessageAt: when, lastInboundAt: when, unread: 1 },
          });
          // waMsgId unique → elak simpan dua kali bila Meta retry webhook
          const exists = m.id ? await db.waMessage.findUnique({ where: { waMsgId: m.id }, select: { id: true } }) : null;
          if (!exists) {
            await db.waMessage.create({
              data: { contactId: contact.id, waMsgId: m.id, direction: "in", type: m.type, body, mediaId, timestamp: when },
            });
            ingested++;
          }
        } catch (e) {
          console.error("[wa-webhook] ingest gagal", e);
        }
      }

      // Status mesej KELUAR (sent → delivered → read / failed)
      for (const s of v.statuses ?? []) {
        try {
          const err = s.errors?.[0]?.title;
          const r = await db.waMessage.updateMany({
            where: { waMsgId: s.id },
            data: { status: s.status, error: err ?? undefined },
          });
          statusUpdated += r.count;
        } catch (e) {
          console.error("[wa-webhook] status gagal", e);
        }
      }
    }
  }

  return NextResponse.json({ ok: true, ingested, statusUpdated });
}
