import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

// Kedai WordPress yang ada snippet "Aazflo - Purge Cache Harian (endpoint)".
const SITES = ["facelim.com", "facelimsg.com", "maxlim.shop", "maxlimsg.com", "eviorofficial.com"];
const UA = "Mozilla/5.0 (Aazflo purge)"; // WAF Cloudflare/Cloudways tolak request tanpa User-Agent

// 🧹 PURGE HARIAN — 04:30 MYT: kosongkan Varnish + object cache semua kedai, kemudian buka
// homepage supaya cache baru siap sebelum subuh & sebelum ads bangun 06:00 (pelawat pertama dapat page laju).
// Kunci endpoint = sha256(CRON_SECRET:aazflo-purge) — tiada rahsia baru dalam repo.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const key = createHash("sha256").update(`${process.env.CRON_SECRET}:aazflo-purge`).digest("hex").slice(0, 40);

  const results = await Promise.all(
    SITES.map(async (site) => {
      try {
        const r = await fetch(`https://${site}/?aazflo_purge=${key}&t=${Date.now()}`, {
          headers: { "User-Agent": UA },
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        });
        const j = await r.json().catch(() => ({}));
        // Panaskan cache: buka homepage (versi baru dijana & disimpan Varnish)
        const w = await fetch(`https://${site}/`, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
        return { site, ok: Boolean(j.ok) || j.skip !== undefined, purge: j, warm: w.status };
      } catch (e) {
        return { site, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );

  const failed = results.filter((r) => !r.ok || ("warm" in r && r.warm !== 200));
  if (failed.length) {
    await sendTelegram(
      `⚠️ <b>Purge cache harian gagal</b>\n` + failed.map((f) => `• ${f.site}: ${"error" in f ? f.error : `warm ${"warm" in f ? f.warm : "-"}`}`).join("\n")
    );
  }
  return NextResponse.json({ ok: failed.length === 0, results });
}
