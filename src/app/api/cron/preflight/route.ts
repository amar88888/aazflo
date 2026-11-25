import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 160;

// 🛫 SEMAKAN PRA-IKLAN — 05:20 MYT (lepas purge-cache 04:55, sebelum ads bangun 06:00).
// Amar minta (25 Nov 2026) jadikan rutin: cache bersih + landing elok + pixel sihat SEBELUM iklan jalan.
//  1. Setiap landing (URL biasa, macam pelanggan): HTTP 200, cache baru (Age kecil), borang + pixel + harga ada,
//     tiada ayat larangan, semua gambar 200.
//  2. Pixel Meta: event masuk dalam 12 jam lepas (PageView; Facelim juga InitiateCheckout).
// Telegram SENTIASA hantar ringkasan (✅ / ⚠️) supaya Amar tahu rutin jalan.
// NOTA: ?aazflo_purge tak berkesan utk facelim.com & maxlim.shop (25 Nov) → kalau cache lama,
// alert minta tekan Cloudways → MAXLIM SERVER → Manage Services → Varnish → Purge.
// MAXLIM SERVER: jangan hentam serentak (Imunify DoS) → semua request berjujukan + jeda.

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Aazflo-preflight";
const STALE_AGE_S = 2 * 3600; // purge 04:55 → pada 05:20 Age patut < ~30 min; > 2 jam = purge tak jalan
const BANNED = ["bakar lemak", "membakar lemak", "cairkan lemak", "kurus", "turun kg"];
const CLOUDWAYS_URL = "https://unified.cloudways.com/server/1606322/services";

const SITES: { site: string; label: string; must: string[]; banned?: string[] }[] = [
  { site: "facelim.com", label: "Facelim MY", must: ["Lengkapkan Tempahan", "1107391808487682", "RM49"], banned: ["PayNow"] },
  { site: "facelimsg.com", label: "Facelim SG", must: ["Lengkapkan Tempahan", "1228069215467379", "S$49"], banned: ["PayNow"] },
  { site: "maxlim.shop", label: "Maxlim", must: ["SAHKAN TEMPAHAN", "3814603735419157", "RM59"] },
];
const PIXELS: { label: string; id: string; needIC: boolean }[] = [
  { label: "Facelim MY", id: "1107391808487682", needIC: true },
  { label: "Facelim SG", id: "1228069215467379", needIC: true },
  { label: "Maxlim", id: "3814603735419157", needIC: false },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function checkSite(s: (typeof SITES)[number]) {
  const issues: string[] = [];
  let imgs = 0;
  try {
    const r = await fetch(`https://${s.site}/`, { headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const html = await r.text();
    const age = Number(r.headers.get("age") || 0);
    if (r.status !== 200) issues.push(`HTTP ${r.status}`);
    if (age > STALE_AGE_S) issues.push(`cache lama ${Math.round(age / 3600)} jam (purge tak jalan)`);
    const miss = s.must.filter((k) => !html.includes(k));
    if (miss.length) issues.push(`hilang: ${miss.join(", ")}`);
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").toLowerCase();
    const bad = [...BANNED, ...(s.banned || [])].filter((w) => text.includes(w.toLowerCase()));
    if (bad.length) issues.push(`ayat larangan: ${bad.join(", ")}`);
    const urls = [...new Set([...html.matchAll(/<img[^>]+src="(https?:\/\/[^"]+)"/g)].map((m) => m[1]))];
    imgs = urls.length;
    const broken: string[] = [];
    for (const u of urls) {
      try {
        const h = await fetch(u, { method: "HEAD", headers: { "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
        if (h.status !== 200) broken.push(`${u.split("/").pop()} (${h.status})`);
      } catch {
        broken.push(`${u.split("/").pop()} (timeout)`);
      }
      await sleep(300);
    }
    if (broken.length) issues.push(`gambar rosak: ${broken.slice(0, 4).join(", ")}${broken.length > 4 ? "…" : ""}`);
  } catch (e) {
    issues.push(e instanceof Error ? e.message : String(e));
  }
  return { site: s.site, label: s.label, imgs, issues };
}

async function checkPixels() {
  const cfg = await getMetaCreds();
  if (!cfg) return PIXELS.map((p) => ({ label: p.label, events: {} as Record<string, number>, issues: ["token Meta tiada"] }));
  const now = Math.floor(Date.now() / 1000);
  const out = [];
  for (const p of PIXELS) {
    const issues: string[] = [];
    const events: Record<string, number> = {};
    try {
      const qs = new URLSearchParams({ aggregation: "event", start_time: String(now - 12 * 3600), end_time: String(now), access_token: cfg.accessToken });
      const j = await (await fetch(`https://graph.facebook.com/v22.0/${p.id}/stats?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) })).json();
      if (j.error) issues.push(`API: ${String(j.error.message).slice(0, 80)}`);
      for (const b of j.data || []) for (const d of b.data || []) events[d.value] = (events[d.value] || 0) + d.count;
      if (!j.error && !events.PageView) issues.push("0 PageView 12 jam");
      if (!j.error && p.needIC && !events.InitiateCheckout) issues.push("0 InitiateCheckout 12 jam");
    } catch (e) {
      issues.push(e instanceof Error ? e.message : String(e));
    }
    out.push({ label: p.label, events, issues });
  }
  return out;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const sites = [];
  for (const s of SITES) {
    sites.push(await checkSite(s));
    await sleep(2000);
  }
  const pixels = await checkPixels();
  const bad = sites.some((s) => s.issues.length) || pixels.some((p) => p.issues.length);
  const stale = sites.some((s) => s.issues.some((i) => i.startsWith("cache lama")));

  const fmt = (e: Record<string, number>) =>
    ["PageView", "InitiateCheckout", "Purchase"].map((k) => `${k === "PageView" ? "PV" : k === "InitiateCheckout" ? "IC" : "Beli"} ${e[k] || 0}`).join(" · ");
  const msg =
    `${bad ? "⚠️" : "✅"} <b>Semakan pra-iklan</b> (sebelum ads 06:00)\n\n` +
    `<b>Website</b>\n` +
    sites.map((s) => `${s.issues.length ? "⚠️" : "✅"} ${s.label}${s.issues.length ? ": " + s.issues.join("; ") : ` — ${s.imgs} gambar OK, borang & pixel ada`}`).join("\n") +
    `\n\n<b>Pixel (12 jam)</b>\n` +
    pixels.map((p) => `${p.issues.length ? "⚠️" : "✅"} ${p.label}: ${fmt(p.events)}${p.issues.length ? " — " + p.issues.join("; ") : ""}`).join("\n") +
    (stale ? `\n\n👉 Cache lama: tekan <b>Purge</b> Varnish di Cloudways → ${CLOUDWAYS_URL}` : "");

  if (url.searchParams.get("dry") !== "1") await sendTelegram(msg).catch(() => {});
  // ok:true walaupun ada isu (isu dah dilapor dlm Telegram) — elak jadual hantar alert "gagal" berganda.
  return NextResponse.json({ ok: true, bad, sites, pixels, msg });
}
