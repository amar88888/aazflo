import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPnlData } from "@/lib/queries";
import { formatRM } from "@/lib/format";
import { PROFIT_TARGET } from "@/lib/constants";
import { startOfDayMY, endOfDayMY } from "@/lib/myt";
import { getTelegramConfig, getRecipients, addRecipient, removeRecipient } from "@/lib/telegram";

// 💰 Bot "Profit Sekelip Mata" — taip apa-apa kat bot Telegram, dapat untung terkini SERTA-MERTA.
// Telegram hantar update ke sini (webhook). Balas untung hari ni + target.
const ACTIVE = ["pending", "printed", "shipped", "completed"];

async function reply(chatId: string, botToken: string, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  }).catch(() => {});
}

export async function POST(req: Request) {
  // Sahkan rahsia dari header Telegram (diset masa setWebhook)
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: true }); // senyap, jangan beri petunjuk
  }
  const { botToken, chatId } = await getTelegramConfig();
  if (!botToken || !chatId) return NextResponse.json({ ok: true });

  const update = await req.json().catch(() => ({}));
  const msg = update?.message ?? update?.edited_message;
  if (!msg) return NextResponse.json({ ok: true });
  const fromChat = String(msg?.chat?.id ?? "");
  const fromUser = String(msg?.from?.id ?? ""); // penghantar (owner = chatId peribadi)
  const cmd = String(msg?.text ?? "").trim().toLowerCase();
  const owner = String(chatId);

  // ── Command: /daftar & /buang — OWNER sahaja boleh daftar group/admin baru ──
  if (cmd.startsWith("/daftar") || cmd.startsWith("/buang")) {
    if (fromUser !== owner) {
      await reply(fromChat, botToken, "⚠️ Hanya owner boleh daftar/buang penerima report.");
      return NextResponse.json({ ok: true });
    }
    if (cmd.startsWith("/daftar")) {
      const added = await addRecipient(fromChat);
      await reply(fromChat, botToken, added ? "✅ Chat ni DAH DIDAFTAR terima report EVIOR (ka-ching, laporan untung, dll). Admin dalam group ni akan nampak semua." : "ℹ️ Chat ni memang dah terima report.");
    } else {
      const removed = await removeRecipient(fromChat);
      await reply(fromChat, botToken, removed ? "🗑️ Chat ni dah DIBUANG dari senarai penerima report." : "ℹ️ Chat ni bukan penerima tambahan.");
    }
    return NextResponse.json({ ok: true });
  }

  // Profit sekelip mata — hanya untuk chat yang didaftar (owner + group/admin)
  const recipients = await getRecipients();
  if (!recipients.includes(fromChat)) return NextResponse.json({ ok: true });

  const now = new Date();
  const ds = startOfDayMY(now);
  const de = endOfDayMY(now);
  const [pnl, byStore] = await Promise.all([
    getPnlData(ds, de),
    db.order.groupBy({
      by: ["store"],
      where: { orderedAt: { gte: ds, lte: de }, status: { in: ACTIVE } },
      _count: true,
    }),
  ]);
  const STORE_LABELS: Record<string, string> = {
    facelim: "Facelim MY",
    facelimsg: "Facelim SG",
    maxlim: "Maxlim MY",
    maxlimsg: "Maxlim SG",
    eviorofficial: "EVIOR Official",
  };
  const orderCount = byStore.reduce((s, x) => s + x._count, 0);
  const storeLines = byStore
    .map((x) => ({ label: STORE_LABELS[x.store] ?? x.store, n: x._count }))
    .sort((a, b) => b.n - a.n)
    .map((x) => `• ${x.label}: ${x.n}`)
    .join("\n");
  const p = pnl.netProfit;
  const roas = pnl.adsSpend > 0 ? pnl.revenue / pnl.adsSpend : 0;
  const floor = PROFIT_TARGET.floor;
  const goal = PROFIT_TARGET.goal;
  const pct = Math.round((p / goal) * 100);
  const bar = "█".repeat(Math.max(0, Math.min(10, Math.round((p / goal) * 10)))).padEnd(10, "░");

  const line =
    p >= goal ? "🏆 Target tercapai!" : p >= floor ? `✅ ${formatRM(goal - p)} lagi ke ${formatRM(goal)}` : `🎯 ${formatRM(floor - p)} lagi ke minimum ${formatRM(floor)}`;

  const text =
    `<b>💰 UNTUNG HARI NI</b>\n` +
    `<b>${formatRM(p)}</b>\n` +
    `${bar} ${pct}%\n` +
    `━━━━━━━━━━\n` +
    `Jualan ${formatRM(pnl.revenue)} · ${orderCount} order\n` +
    `Iklan ${formatRM(pnl.adsSpend)}${roas > 0 ? ` · ROAS ${roas.toFixed(2)}x` : ""}\n` +
    `Kos barang ${formatRM(pnl.cogs)} · Pos ${formatRM(pnl.shipping)}\n` +
    (storeLines ? `\n<b>🏪 Order ikut kedai</b>\n${storeLines}\n` : "") +
    `\n${line}`;

  await reply(fromChat, botToken, text);
  return NextResponse.json({ ok: true });
}
