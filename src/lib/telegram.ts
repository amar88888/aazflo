import { loadCredentials } from "@/lib/credentials";

export type TelegramCreds = { botToken: string; chatId: string };

// Config dari DB (ApiCredential 'telegram', encrypted) dengan fallback ke .env.
export async function getTelegramConfig(): Promise<{ botToken?: string; chatId?: string }> {
  const saved = await loadCredentials<TelegramCreds>("telegram");
  return {
    botToken: saved?.botToken || process.env.TELEGRAM_BOT_TOKEN || undefined,
    chatId: saved?.chatId || process.env.TELEGRAM_CHAT_ID || undefined,
  };
}

export async function sendTelegram(text: string): Promise<{ ok: boolean; error?: string }> {
  const { botToken, chatId } = await getTelegramConfig();
  if (!botToken || !chatId) return { ok: false, error: "Bot token atau Chat ID belum diset." };
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    const json = await res.json().catch(() => ({}) as { ok?: boolean; description?: string });
    if (!json.ok) return { ok: false, error: json.description || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ralat rangkaian." };
  }
}

// Auto-detect chat ID dari mesej terakhir yang dihantar ke bot (getUpdates).
export async function detectChatId(botTokenOverride?: string): Promise<{ ok: boolean; chatId?: string; error?: string }> {
  const token = botTokenOverride || (await getTelegramConfig()).botToken;
  if (!token) return { ok: false, error: "Bot token belum diset." };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    const json = await res.json().catch(() => ({}) as { ok?: boolean; description?: string; result?: unknown[] });
    if (!json.ok) return { ok: false, error: json.description || "Gagal getUpdates." };
    const updates = (json.result ?? []) as { message?: { chat?: { id?: number } }; channel_post?: { chat?: { id?: number } } }[];
    const last = [...updates].reverse().find((u) => u.message?.chat?.id || u.channel_post?.chat?.id);
    const id = last?.message?.chat?.id ?? last?.channel_post?.chat?.id;
    if (!id) return { ok: false, error: "Tiada mesej dijumpai. Hantar /start ke @aazmsa_bot dahulu." };
    return { ok: true, chatId: String(id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ralat rangkaian." };
  }
}
