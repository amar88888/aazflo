import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPnlData } from "@/lib/queries";
import { formatRM } from "@/lib/format";
import { PROFIT_TARGET } from "@/lib/constants";
import { startOfDayMY, endOfDayMY } from "@/lib/myt";
import { getTelegramConfig } from "@/lib/telegram";

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
  const fromChat = String(msg?.chat?.id ?? "");
  if (!msg || fromChat !== String(chatId)) return NextResponse.json({ ok: true });

  const now = new Date();
  const ds = startOfDayMY(now);
  const de = endOfDayMY(now);
  const [pnl, orderCount] = await Promise.all([
    getPnlData(ds, de),
    db.order.count({ where: { orderedAt: { gte: ds, lte: de }, status: { in: ACTIVE } } }),
  ]);
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
    `${line}`;

  await reply(fromChat, botToken, text);
  return NextResponse.json({ ok: true });
}
