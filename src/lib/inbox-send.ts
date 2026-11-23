import { sendWhatsAppText } from "@/lib/whatsapp";
import { sendMetaMessage } from "@/lib/meta-inbox";

// Hantar teks ke kontak inbox ikut saluran dia.
export async function sendToContact(
  contact: { waId: string; channel: string; pageId: string | null },
  text: string,
): Promise<{ ok: boolean; msgId?: string; error?: string }> {
  if (contact.channel === "messenger" || contact.channel === "instagram") {
    const userId = contact.waId.replace(/^(fb|ig):/, "");
    return sendMetaMessage(contact.pageId, userId, text);
  }
  const r = await sendWhatsAppText(contact.waId, text);
  return { ok: r.ok, msgId: r.waMsgId, error: r.error };
}
