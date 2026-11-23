"use server";

import { db } from "@/lib/db";
import { toWaId } from "@/lib/whatsapp";
import { sendToContact } from "@/lib/inbox-send";
import { revalidatePath } from "next/cache";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export type Conversation = {
  id: string;
  waId: string;
  channel: string; // whatsapp | messenger | instagram
  name: string | null;
  unread: number;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  preview: string;
  lastDirection: string | null;
  lastBot: boolean;
  windowOpen: boolean;
  done: boolean; // ditanda "Selesai" (dibuka semula automatik bila pelanggan mesej lagi)
  needsHuman: boolean; // bot serahkan — staff perlu balas
  botPaused: boolean;
};

export type ThreadMessage = {
  id: string;
  direction: string;
  body: string | null;
  type: string;
  status: string | null;
  error: string | null;
  bot: boolean;
  timestamp: string;
};

// Senarai perbualan (terbaru dulu), dengan preview mesej terakhir.
export async function listConversations(): Promise<Conversation[]> {
  // Semua perbualan (termasuk Selesai) — client tapis ikut tab & saluran.
  const contacts = await db.waContact.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: 300,
    include: { messages: { orderBy: { timestamp: "desc" }, take: 1 } },
  });
  const now = Date.now();
  return contacts.map((c) => {
    const last = c.messages[0];
    return {
      id: c.id,
      waId: c.waId,
      channel: c.channel,
      name: c.name,
      unread: c.unread,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      lastInboundAt: c.lastInboundAt?.toISOString() ?? null,
      preview: last?.body ?? "",
      lastDirection: last?.direction ?? null,
      lastBot: !!last?.bot,
      windowOpen: !!c.lastInboundAt && now - c.lastInboundAt.getTime() < WINDOW_MS,
      done: c.archived,
      needsHuman: c.needsHuman,
      botPaused: c.botPaused,
    };
  });
}

// Tanda perbualan Selesai / buka semula. (Webhook auto buka semula bila mesej baru masuk.)
export async function setDone(contactId: string, done: boolean): Promise<void> {
  await db.waContact.update({
    where: { id: contactId },
    data: { archived: done, ...(done ? { unread: 0, needsHuman: false } : {}) },
  });
  revalidatePath("/inbox");
}

// Hidup/matikan bot untuk satu kontak. Hidupkan semula = kosongkan "perlu manusia".
export async function setBot(contactId: string, on: boolean): Promise<void> {
  await db.waContact.update({
    where: { id: contactId },
    data: { botPaused: !on, ...(on ? { needsHuman: false } : {}) },
  });
  revalidatePath("/inbox");
}

// Buka satu perbualan — tanda sudah baca + pulang semua mesej (lama → baru).
export async function getThread(contactId: string): Promise<{
  contact: {
    id: string;
    waId: string;
    channel: string;
    name: string | null;
    windowOpen: boolean;
    lastInboundAt: string | null;
    botPaused: boolean;
    needsHuman: boolean;
  } | null;
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
      channel: contact.channel,
      name: contact.name,
      lastInboundAt: contact.lastInboundAt?.toISOString() ?? null,
      windowOpen: !!contact.lastInboundAt && now - contact.lastInboundAt.getTime() < WINDOW_MS,
      botPaused: contact.botPaused,
      needsHuman: contact.needsHuman,
    },
    messages: msgs.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      type: m.type,
      status: m.status,
      error: m.error,
      bot: m.bot,
      timestamp: m.timestamp.toISOString(),
    })),
  };
}

// Staff balas pelanggan (teks free-form, dalam tetingkap 24 jam).
// Manusia dah ambil alih → bot berhenti untuk kontak ni & "perlu manusia" dikosongkan.
export async function sendReply(
  contactId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const body = text.trim();
  if (!body) return { ok: false, error: "Mesej kosong." };
  const contact = await db.waContact.findUnique({ where: { id: contactId } });
  if (!contact) return { ok: false, error: "Kontak tak dijumpai." };

  const windowOpen = !!contact.lastInboundAt && Date.now() - contact.lastInboundAt.getTime() < WINDOW_MS;
  if (!windowOpen) {
    return { ok: false, error: "Tetingkap 24 jam dah tamat — pelanggan kena mesej dulu." };
  }

  const r = await sendToContact(contact, body);
  const now = new Date();
  await db.waMessage.create({
    data: {
      contactId,
      waMsgId: r.msgId ?? null,
      direction: "out",
      type: "text",
      body,
      status: r.ok ? "sent" : "failed",
      error: r.ok ? null : r.error ?? "Gagal hantar",
      timestamp: now,
    },
  });
  if (r.ok) {
    await db.waContact.update({
      where: { id: contactId },
      data: { lastMessageAt: now, botPaused: true, needsHuman: false },
    });
  }
  revalidatePath("/inbox");
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function archiveConversation(contactId: string): Promise<void> {
  await db.waContact.update({ where: { id: contactId }, data: { archived: true } });
  revalidatePath("/inbox");
}

// Bantuan: normalkan nombor jadi waId.
export async function normalizeNumber(num: string): Promise<string> {
  return toWaId(num);
}
