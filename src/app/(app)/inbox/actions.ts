"use server";

import { db } from "@/lib/db";
import { sendWhatsAppText, toWaId } from "@/lib/whatsapp";
import { revalidatePath } from "next/cache";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export type Conversation = {
  id: string;
  waId: string;
  name: string | null;
  unread: number;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  preview: string;
  lastDirection: string | null;
  windowOpen: boolean;
};

export type ThreadMessage = {
  id: string;
  direction: string;
  body: string | null;
  type: string;
  status: string | null;
  error: string | null;
  timestamp: string;
};

// Senarai perbualan (terbaru dulu), dengan preview mesej terakhir.
export async function listConversations(): Promise<Conversation[]> {
  const contacts = await db.waContact.findMany({
    where: { archived: false },
    orderBy: { lastMessageAt: "desc" },
    take: 200,
    include: { messages: { orderBy: { timestamp: "desc" }, take: 1 } },
  });
  const now = Date.now();
  return contacts.map((c) => {
    const last = c.messages[0];
    return {
      id: c.id,
      waId: c.waId,
      name: c.name,
      unread: c.unread,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      lastInboundAt: c.lastInboundAt?.toISOString() ?? null,
      preview: last?.body ?? "",
      lastDirection: last?.direction ?? null,
      windowOpen: !!c.lastInboundAt && now - c.lastInboundAt.getTime() < WINDOW_MS,
    };
  });
}

// Buka satu perbualan — tanda sudah baca + pulang semua mesej (lama → baru).
export async function getThread(contactId: string): Promise<{
  contact: { id: string; waId: string; name: string | null; windowOpen: boolean; lastInboundAt: string | null } | null;
  messages: ThreadMessage[];
}> {
  const contact = await db.waContact.findUnique({ where: { id: contactId } });
  if (!contact) return { contact: null, messages: [] };
  if (contact.unread > 0) {
    await db.waContact.update({ where: { id: contactId }, data: { unread: 0 } });
  }
  const msgs = await db.waMessage.findMany({ where: { contactId }, orderBy: { timestamp: "asc" }, take: 500 });
  const now = Date.now();
  return {
    contact: {
      id: contact.id,
      waId: contact.waId,
      name: contact.name,
      lastInboundAt: contact.lastInboundAt?.toISOString() ?? null,
      windowOpen: !!contact.lastInboundAt && now - contact.lastInboundAt.getTime() < WINDOW_MS,
    },
    messages: msgs.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      type: m.type,
      status: m.status,
      error: m.error,
      timestamp: m.timestamp.toISOString(),
    })),
  };
}

// Balas pelanggan (teks free-form). Sah hanya dalam tetingkap 24 jam.
export async function sendReply(
  contactId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const body = text.trim();
  if (!body) return { ok: false, error: "Mesej kosong." };
  const contact = await db.waContact.findUnique({ where: { id: contactId } });
  if (!contact) return { ok: false, error: "Kontak tak dijumpai." };

  const windowOpen = !!contact.lastInboundAt && Date.now() - contact.lastInboundAt.getTime() < 24 * 60 * 60 * 1000;
  if (!windowOpen) {
    return { ok: false, error: "Tetingkap 24 jam dah tamat — pelanggan kena mesej dulu, atau guna template berbayar." };
  }

  const r = await sendWhatsAppText(contact.waId, body);
  const now = new Date();
  await db.waMessage.create({
    data: {
      contactId,
      waMsgId: r.waMsgId ?? null,
      direction: "out",
      type: "text",
      body,
      status: r.ok ? "sent" : "failed",
      error: r.ok ? null : r.error ?? "Gagal hantar",
      timestamp: now,
    },
  });
  if (r.ok) await db.waContact.update({ where: { id: contactId }, data: { lastMessageAt: now } });
  revalidatePath("/inbox");
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// Mula perbualan baru dengan satu nombor (mesti dalam tetingkap 24 jam — biasanya
// untuk balas orang yang baru WhatsApp kita tapi belum wujud sebagai kontak).
export async function archiveConversation(contactId: string): Promise<void> {
  await db.waContact.update({ where: { id: contactId }, data: { archived: true } });
  revalidatePath("/inbox");
}

// Untuk butang "Mula chat" — normalkan nombor jadi waId (bantuan sahaja).
export async function normalizeNumber(num: string): Promise<string> {
  return toWaId(num);
}
