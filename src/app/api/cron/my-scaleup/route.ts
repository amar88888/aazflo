import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";
const MY_ADSET = "120251722984390356"; // FACELIM MY broad
// 23 Okt RM2k: CPP naik RM21→RM30, budget habis sebelum malam. Turun RM1,500 (bukan musim gaji);
// scale balik masa gaji.
const TARGET = "150000"; // RM1500
const SCALE_DATE = "2026-10-24"; // tukar clean tengah malam

function mytDate(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// 🎯 MY BUDGET — tukar budget MY ke TARGET start hari baru (bukan jump tengah hari).
// Fires 00:06 MYT; date-guard supaya sekali sahaja pada SCALE_DATE. Cara pro: tukar start clean.
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
      `🎯 <b>MY BUDGET</b> — set RM1,500 (hari baru, start clean).\n` +
        `RM2k makan CPP (RM21→RM30). Tahan RM1,500, scale balik masa gaji. Winner je jalan. 💰`
    );
  }
  return NextResponse.json({ ok, budget: j.daily_budget, error: j.error?.message || null });
}
