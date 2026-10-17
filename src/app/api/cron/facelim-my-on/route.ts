import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";

const GRAPH = "https://graph.facebook.com/v21.0";

// Ad MENANG Facelim MY (campaign LIVE 5 OKT) — terpilih ikut ROAS sepanjang hayat (≥3.8×, jualan sebenar).
// Yang lemah (ROAS 0) sengaja TAK disenaraikan supaya tak bakar duit.
const WINNERS: { id: string; name: string; roas: string }[] = [
  { id: "120251723508270356", name: "Video Testimoni Hitam", roas: "5.78×" },
  { id: "120251811474270356", name: "IMG_6851 V1", roas: "5.73×" },
  { id: "120251722986190356", name: "Gossip Suami", roas: "4.64×" },
  { id: "120251749247460356", name: "UGC Muka V", roas: "3.81×" },
];
const ADSET_ID = "120251722984390356"; // FACELIM MY broad - 5 OKT (RM100)
const CAMPAIGN_ID = "120251722983690356";

// Hidupkan ad menang Facelim MY. Dijadualkan 00:01 MYT (hari iklan penuh, elak Meta rembat baki budget).
// Sekali jalan je (date-guard 18 Okt) — lepas tu auto-profit uruskan. ?force=1 abai date-guard.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  const force = url.searchParams.get("force") === "1";
  const mytDate = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  // Hanya jalan pada 18 Okt 2026 (atau paksa) — elak lawan auto-profit hari-hari seterusnya.
  if (!force && mytDate !== "2026-10-18") {
    return NextResponse.json({ ok: true, skipped: `bukan tarikh sasaran (${mytDate})` });
  }
  const g = globalThis as { __facelimMyOn?: string };
  if (!force && g.__facelimMyOn === mytDate) {
    return NextResponse.json({ ok: true, skipped: "sudah dijalankan hari ini" });
  }

  const cfg = await getMetaCreds();
  if (!cfg) return NextResponse.json({ ok: false, message: "Meta belum di-setup" }, { status: 400 });
  const gpost = async (id: string, body: Record<string, string>) => {
    const r = await fetch(`${GRAPH}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...body, access_token: cfg.accessToken }).toString(),
    });
    const j = await r.json();
    return r.ok && !j.error ? { ok: true } : { ok: false, error: j.error?.error_user_msg || j.error?.message || "gagal" };
  };

  // Pastikan campaign + adset aktif, lepas tu hidupkan setiap ad menang.
  await gpost(CAMPAIGN_ID, { status: "ACTIVE" });
  await gpost(ADSET_ID, { status: "ACTIVE" });
  const results: string[] = [];
  let okCount = 0;
  for (const w of WINNERS) {
    const r = await gpost(w.id, { status: "ACTIVE" });
    if (r.ok) {
      okCount++;
      results.push(`✅ ${w.name} (${w.roas})`);
    } else {
      results.push(`⚠️ ${w.name}: ${r.error}`);
    }
  }
  g.__facelimMyOn = mytDate;

  const msg =
    `<b>🚀 Facelim MY ON (00:01)</b>\n${okCount}/${WINNERS.length} ad menang dihidupkan:\n` +
    results.join("\n") +
    `\n\nAuto-profit akan pantau & urus dari sini. SG terus jalan. 💰`;
  await sendTelegram(msg).catch(() => {});

  return NextResponse.json({ ok: true, enabled: okCount, results, mytDate });
}
