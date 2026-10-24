import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";
import { getSetting, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";
// Adset yang rehat malam + flag ("1" = di-pause oleh rule malam ni, bukan manual)
const ADSETS = [
  { id: "120251722984390356", name: "MY", flag: "my_malam_paused" }, // FACELIM MY broad
  { id: "120251768506270356", name: "TEST", flag: "test_malam_paused" }, // TEST broad MY - creative hunt
];

// 🌙 REHAT MALAM — 12 malam–6 pagi bakar duit utk sedikit sale (CPP RM70-100 vs siang RM25-30).
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

  const setStatus = async (id: string, status: string) => {
    const r = await fetch(`${GRAPH}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ status, access_token: accessToken }).toString(),
    });
    const j = await r.json();
    return r.ok && !j.error;
  };

  const results: Record<string, string> = {};
  const failed: string[] = [];
  for (const a of ADSETS) {
    const r0 = await fetch(`${GRAPH}/${a.id}?fields=status&access_token=${accessToken}`, { cache: "no-store" });
    const cur = (await r0.json()).status as string;

    if (action === "rest") {
      if (cur !== "ACTIVE") { results[a.name] = `skip (${cur})`; continue; }
      const ok = await setStatus(a.id, "PAUSED");
      if (ok) await setSetting(a.flag, "1");
      results[a.name] = ok ? "PAUSED" : "gagal";
      continue;
    }

    // wake
    if ((await getSetting(a.flag)) !== "1") { results[a.name] = "skip (bukan rule malam)"; continue; }
    if (cur === "ACTIVE") { await setSetting(a.flag, "0"); results[a.name] = "dah ACTIVE"; continue; }
    const ok = await setStatus(a.id, "ACTIVE");
    if (ok) await setSetting(a.flag, "0");
    else failed.push(a.name);
    results[a.name] = ok ? "ACTIVE" : "gagal";
  }
  if (failed.length) {
    await sendTelegram(`⚠️ <b>${failed.join(", ")} gagal hidup balik</b> lepas rehat malam — cuba semula 06:20/07:00. Check kalau berterusan.`);
  }
  return NextResponse.json({ ok: failed.length === 0, action, results });
}
