import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";
import { getSetting, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";
const MY_ADSET = "120251722984390356"; // FACELIM MY broad
const FLAG = "my_malam_paused"; // "1" = adset di-pause oleh rule malam ni (bukan manual)

// 🌙 MY REHAT MALAM (live 24 Okt) — 12 malam–6 pagi MY bakar ~RM210 utk 2-4 sale (CPP RM70-100 vs siang RM25-30).
// Pause adset waktu malam; daily budget kemudian dibelanja waktu siang yang lebih murah.
//   ?action=rest  → pause (00:02)   ?action=wake → hidup balik (06:00, ulang 06:20 & 07:00 sbg backup)
// Wake HANYA kalau rule ni yang pause (flag) — tak hidupkan adset yang di-pause manual.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const action = url.searchParams.get("action");
  if (action !== "rest" && action !== "wake") {
    return NextResponse.json({ ok: false, message: "action=rest|wake" }, { status: 400 });
  }
  const cfg = await getMetaCreds();
  if (!cfg) return NextResponse.json({ ok: false, message: "Meta belum di-setup" }, { status: 400 });
  const { accessToken } = cfg;

  const r0 = await fetch(`${GRAPH}/${MY_ADSET}?fields=status&access_token=${accessToken}`, { cache: "no-store" });
  const cur = (await r0.json()).status as string;
  const setStatus = async (status: string) => {
    const r = await fetch(`${GRAPH}/${MY_ADSET}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ status, access_token: accessToken }).toString(),
    });
    const j = await r.json();
    return r.ok && !j.error;
  };

  if (action === "rest") {
    if (cur !== "ACTIVE") return NextResponse.json({ ok: true, action, skipped: `MY ${cur} (bukan ACTIVE)` });
    const ok = await setStatus("PAUSED");
    if (ok) await setSetting(FLAG, "1");
    return NextResponse.json({ ok, action, was: cur });
  }

  // wake
  if ((await getSetting(FLAG)) !== "1") return NextResponse.json({ ok: true, action, skipped: "bukan di-pause oleh rule malam" });
  if (cur === "ACTIVE") {
    await setSetting(FLAG, "0");
    return NextResponse.json({ ok: true, action, skipped: "dah ACTIVE" });
  }
  const ok = await setStatus("ACTIVE");
  if (ok) {
    await setSetting(FLAG, "0");
  } else {
    await sendTelegram("⚠️ <b>MY gagal hidup balik</b> lepas rehat malam — cuba semula 06:20/07:00. Check kalau berterusan.");
  }
  return NextResponse.json({ ok, action, was: cur });
}
