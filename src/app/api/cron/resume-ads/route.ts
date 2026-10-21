import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";

// Campaign Facelim yang ditutup malam 21 Okt (pening kepala, reset) — resume fresh 22 Okt 00:01.
const RESUME_CAMPAIGNS = ["120251768496520356", "120251751539750356", "120251722983690356"]; // TEST, SG, MY
const MY_BROAD_ADSET = "120251722984390356";
const MY_FRESH_BUDGET = "120000"; // RM1200 — pulih engine MY (dari RM500 trim semalam)
const RESUME_DATE = "2026-10-22"; // sekali sahaja malam ni

function mytDate(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// ▶️ RESUME ADS — hidupkan balik campaign Facelim yang ditutup, sekali sahaja pada 22 Okt.
// Dipanggil scheduler 00:01 MYT. Date-guard: no-op selepas malam ni.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const force = url.searchParams.get("force") === "1";
  if (mytDate() !== RESUME_DATE && !force) {
    return NextResponse.json({ ok: true, skipped: `bukan ${RESUME_DATE}`, today: mytDate() });
  }
  const cfg = await getMetaCreds();
  if (!cfg) return NextResponse.json({ ok: false, message: "Meta belum di-setup" }, { status: 400 });
  const { accessToken, adAccountId } = cfg;
  void adAccountId;
  const post = async (id: string, body: Record<string, string>) => {
    const r = await fetch(`${GRAPH}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...body, access_token: accessToken }).toString(),
    });
    const j = await r.json();
    return r.ok && !j.error ? { ok: true } : { ok: false, error: j.error?.message || "gagal" };
  };

  const done: string[] = [];
  for (const id of RESUME_CAMPAIGNS) {
    const r = await post(id, { status: "ACTIVE" });
    done.push(`${id}:${r.ok ? "ON" : "GAGAL " + r.error}`);
  }
  // Pulihkan budget engine MY ke paras waras untuk hari baru
  const b = await post(MY_BROAD_ADSET, { daily_budget: MY_FRESH_BUDGET });
  done.push(`MY budget RM1200:${b.ok ? "ok" : "GAGAL " + b.error}`);

  await sendTelegram(
    `▶️ <b>ADS RUN BALIK</b> — fresh start hari baru.\n` +
      `Campaign Facelim dihidupkan (MY/SG/TEST), MY budget RM1,200.\n` +
      `Semua penjaga aktif. Jom buat untung. 💪`
  );

  return NextResponse.json({ ok: true, resumed: done });
}
