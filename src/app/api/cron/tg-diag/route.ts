import { NextResponse } from "next/server";
import { getTelegramConfig, getRecipients } from "@/lib/telegram";

export const dynamic = "force-dynamic";

// 🔎 Diagnostik Telegram — tengok SIAPA penerima report sebenar (owner + group),
// jenis chat, dan sama ada bot boleh hantar ke sana.
// GET /api/cron/tg-diag?secret=XXX           → senarai + info chat
// GET /api/cron/tg-diag?secret=XXX&test=1    → hantar mesej ujian ke semua penerima
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const { botToken, chatId: owner } = await getTelegramConfig();
  if (!botToken) return NextResponse.json({ ok: false, message: "Bot token tak diset" }, { status: 400 });
  const recipients = await getRecipients();
  const doTest = url.searchParams.get("test") === "1";

  const out: unknown[] = [];
  for (const id of recipients) {
    const info: Record<string, unknown> = { chatId: id, isOwner: id === owner };
    try {
      const r = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${encodeURIComponent(id)}`);
      const j = await r.json();
      if (j.ok) {
        info.type = j.result.type; // private | group | supergroup | channel
        info.title = j.result.title ?? j.result.username ?? j.result.first_name ?? null;
        info.reachable = true;
      } else {
        info.reachable = false;
        info.error = j.description; // cth: "chat not found", "bot was kicked"
      }
    } catch (e) {
      info.reachable = false;
      info.error = e instanceof Error ? e.message : "net";
    }
    if (doTest) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: id,
            text: "🔔 <b>TEST KA-CHING</b> — kalau nampak mesej ni, group/chat ni MEMANG terima report. Kalau tak bunyi, semak notifikasi chat ni tak di-mute. 💰",
            parse_mode: "HTML",
          }),
        });
        const j = await r.json();
        info.testSent = !!j.ok;
        if (!j.ok) info.testError = j.description;
      } catch {
        info.testSent = false;
      }
    }
    out.push(info);
  }

  return NextResponse.json({ ok: true, owner, count: recipients.length, recipients: out });
}
