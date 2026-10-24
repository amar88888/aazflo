import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";

const GRAPH = "https://graph.facebook.com/v21.0";

// Status akaun Meta → label
const STATUS: Record<number, string> = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
};

// Ingat keadaan terakhir supaya tak spam (alert bila tukar jadi teruk / pulih, re-alert tiap jam).
const g = globalThis as unknown as { __billing?: { bad: boolean; lastAlert: number; capAlert: number } };
const state = (g.__billing ??= { bad: false, lastAlert: 0, capAlert: 0 });
const HOUR = 3600 * 1000;
// Spend cap akaun penuh = semua ads STOP senyap (24 Okt baki tinggal RM5,279 tanpa sesiapa sedar).
const CAP_WARN = 5000; // RM baki — amaran bila bawah ni (≈ 2-3 hari belanja)

// 🛡️ PENJAGA BILLING — kesan akaun iklan tergantung (bank gagal potong → UNSETTLED/DISABLED → ads STOP senyap).
// Alert Telegram serta-merta supaya tak rugi jualan macam kejadian kad decline.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const cfg = await getMetaCreds();
  if (!cfg) return NextResponse.json({ ok: false, message: "Meta belum di-setup" }, { status: 400 });
  const { accessToken, adAccountId } = cfg;

  const qs = new URLSearchParams({
    fields: "account_status,disable_reason,balance,currency,name,spend_cap,amount_spent",
    access_token: accessToken,
  }).toString();
  const r = await fetch(`${GRAPH}/${adAccountId}?${qs}`, { cache: "no-store" });
  const d = await r.json();
  if (d.error) return NextResponse.json({ ok: false, message: d.error.message }, { status: 500 });

  const st = Number(d.account_status);
  const bad = st !== 1; // apa-apa selain ACTIVE = bermasalah
  const owed = (Number(d.balance) || 0) / 100;
  const cur = d.currency || "RM";
  const label = STATUS[st] ?? `status ${st}`;
  const now = Date.now();
  const force = url.searchParams.get("send") === "1";

  let sent: string | null = null;

  if (bad) {
    // Alert bila baru jadi teruk, ATAU setiap jam selagi belum pulih.
    if (!state.bad || now - state.lastAlert > HOUR || force) {
      await sendTelegram(
        `🚨 <b>AKAUN IKLAN TERGANTUNG</b>\n` +
          `Status: <b>${label}</b>\n` +
          `Tertunggak: <b>${cur} ${owed.toFixed(2)}</b>\n` +
          `Ads kemungkinan STOP. Buka Ads Manager → <b>Pay Now</b> (approve OTP) supaya ads hidup balik. 💳`
      );
      state.lastAlert = now;
      sent = "alert";
    }
  } else if (state.bad) {
    // Baru pulih dari keadaan teruk → maklum sekali.
    await sendTelegram(`✅ <b>Akaun iklan PULIH</b> — status ACTIVE balik. Ads jalan semula. 🎉`);
    sent = "recovered";
  }

  state.bad = bad;

  // Baki spend cap (0 = tiada cap). Amaran sekali sehari bila bawah CAP_WARN.
  const cap = (Number(d.spend_cap) || 0) / 100;
  const capLeft = cap > 0 ? cap - (Number(d.amount_spent) || 0) / 100 : null;
  if (capLeft !== null && capLeft < CAP_WARN && (now - state.capAlert > 24 * HOUR || force)) {
    await sendTelegram(
      `⚠️ <b>SPEND CAP HAMPIR PENUH</b>\n` +
        `Baki: <b>${cur} ${capLeft.toFixed(0)}</b> (had ${cur} ${cap.toFixed(0)})\n` +
        `Bila penuh, SEMUA ads berhenti senyap. Naikkan had dalam Ads Manager → Billing → Account spending limit.`
    );
    state.capAlert = now;
    sent = sent ? `${sent}+cap` : "cap";
  }

  return NextResponse.json({
    capLeft,
    ok: true,
    status: label,
    accountStatus: st,
    owed,
    currency: cur,
    bad,
    sent,
  });
}
