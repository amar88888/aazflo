import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";
const MY_ADSET = "120251722984390356"; // FACELIM MY broad
const TARGET = "200000"; // RM2000
const SCALE_DATE = "2026-10-23"; // start scaleup clean esok tengah malam

function mytDate(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// 🚀 MY SCALEUP — naikkan budget MY ke RM2000 start hari baru (bukan jump tengah hari).
// Fires 00:05 MYT; date-guard supaya sekali sahaja pada 23 Okt. Cara pro: ramp start clean.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const force = url.searchParams.get("force") === "1";
  if (mytDate() !== SCALE_DATE && !force) {
    return NextResponse.json({ ok: true, skipped: `bukan ${SCALE_DATE}`, today: mytDate() });
  }
  const cfg = await getMetaCreds();
  if (!cfg) return NextResponse.json({ ok: false, message: "Meta belum di-setup" }, { status: 400 });
  const { accessToken } = cfg;
  const r = await fetch(`${GRAPH}/${MY_ADSET}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ daily_budget: TARGET, access_token: accessToken }).toString(),
  });
  const j = await r.json();
  const ok = r.ok && !j.error;
  if (ok) {
    await sendTelegram(
      `🚀 <b>MY SCALEUP</b> — budget naik RM2,000 (hari baru, start clean).\n` +
        `9 creative (poster winner + video fresh) jalan penuh. Watchdog pantau ROAS. Jom fly profit. 💰`
    );
  }
  return NextResponse.json({ ok, budget: j.daily_budget, error: j.error?.message || null });
}
