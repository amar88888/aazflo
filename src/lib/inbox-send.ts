import { db } from "@/lib/db";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendMetaMessage, replyToComment } from "@/lib/meta-inbox";

export const COMMENT_CHANNELS = ["fb_comment", "ig_comment"] as const;
export const isCommentChannel = (c: string): c is (typeof COMMENT_CHANNELS)[number] =>
  (COMMENT_CHANNELS as readonly string[]).includes(c);

// Hantar teks ke kontak inbox ikut saluran dia.
// Komen FB/IG → balas AWAM pada komen masuk terkini kontak tu.
export async function sendToContact(
  contact: { id?: string; waId: string; channel: string; pageId: string | null },
  text: string,
): Promise<{ ok: boolean; msgId?: string; error?: string }> {
  if (isCommentChannel(contact.channel)) {
    const last = contact.id
      ? await db.waMessage.findFirst({
          where: { contactId: contact.id, direction: "in", waMsgId: { not: null } },
          orderBy: { timestamp: "desc" },
          select: { waMsgId: true },
        })
      : null;
    if (!last?.waMsgId) return { ok: false, error: "Tiada komen untuk dibalas." };
    return replyToComment(contact.channel, contact.pageId, last.waMsgId, text);
  }
  if (contact.channel === "messenger" || contact.channel === "instagram") {
    const userId = contact.waId.replace(/^(fb|ig):/, "");
    return sendMetaMessage(contact.pageId, userId, text);
  }
  const r = await sendWhatsAppText(contact.waId, text);
  return { ok: r.ok, msgId: r.waMsgId, error: r.error };
}
