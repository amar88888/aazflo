import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";
const PUR = new Set(["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]);
const SG_CAMPAIGN = "120251751539750356"; // FACELIM SG - LIVE 7 OKT

// Ambang "sihat" SG (selepas trim + cap auto-profit RM800).
// Nilai asal dikira bila Purchase SG BERGANDA (PixelYourSite). 24 Okt plugin dibuang → purchase 1x:
// CPP sebenar ×2, ROAS sebenar ×0.5 — ambang diselaraskan supaya tindakan sama dengan dulu.
const CPP_OK = 100; // dulu 50 (19 Okt SG RM43 berganda)
const CPP_BAD = 130; // dulu 65 (20 Okt SG RM71 berganda — tepu)

// Ambang AUTO-CUT — SG betul-betul bleeding → pause SENDIRI hari tu (dayparting cuba balik esok).
const CUT_MIN_SPEND = 300; // cukup belanja utk nilai (elak cut pagi palsu)
const CUT_ROAS = 0.75; // dulu 1.5 berganda — ROAS bawah ni = bawah breakeven = rugi
const CUT_CPP = 170; // dulu 85 berganda — CPP atas ni = terlalu mahal, bakar

function ymd(offset = 0): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

// 🇸🇬 SG WATCHDOG — pantau CPP/ROAS SG selepas trim; alert kalau mahal balik (tepu).
// GET /api/cron/sg-watch?secret=XXX
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const cfg = await getMetaCreds();
  if (!cfg) return NextResponse.json({ ok: false, message: "Meta belum di-setup" }, { status: 400 });
  const { accessToken, adAccountId } = cfg;

  const sgStats = async (day: string) => {
    const qs = new URLSearchParams({
      level: "campaign",
      time_range: JSON.stringify({ since: day, until: day }),
      fields: "campaign_name,spend,actions,action_values,cpm,frequency",
      limit: "100",
      access_token: accessToken,
    }).toString();
    const r = await fetch(`${GRAPH}/${adAccountId}/insights?${qs}`, { cache: "no-store" });
    const rows = (await r.json()).data ?? [];
    let spend = 0,
      pur = 0,
      val = 0;
    for (const row of rows) {
      const nm = (row.campaign_name || "").toUpperCase();
      if (!nm.includes("SG") || nm.includes("MAXLIM")) continue;
      spend += parseFloat(row.spend || "0");
      for (const a of row.actions || []) if (a.action_type === "purchase") pur += parseInt(a.value);
      for (const a of row.action_values || []) if (PUR.has(a.action_type)) val += parseFloat(a.value);
    }
    return { spend, pur, val, cpp: pur ? spend / pur : 0, roas: spend ? val / spend : 0 };
  };

  const today = await sgStats(ymd(0));
  const yest = await sgStats(ymd(1));

  // Belum cukup belanja utk dinilai (pagi awal) — jangan alert palsu.
  if (today.spend < 150) {
    return NextResponse.json({ ok: true, skipped: "belanja SG belum cukup utk dinilai", today });
  }

  // 🔪 AUTO-CUT — SG bleeding selepas belanja cukup → pause SENDIRI (tak tunggu manual).
  const bleeding =
    today.spend >= CUT_MIN_SPEND &&
    ((today.roas > 0 && today.roas < CUT_ROAS) || today.cpp >= CUT_CPP);
  if (bleeding) {
    const r = await fetch(`${GRAPH}/${SG_CAMPAIGN}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ status: "PAUSED", access_token: accessToken }).toString(),
    });
    const cut = r.ok && !(await r.clone().json()).error;
    await sendTelegram(
      `🔪 <b>SG AUTO-CUT</b> — SG bleeding, dipotong terus.\n` +
        `CPP RM${today.cpp.toFixed(0)} · ROAS ${today.roas.toFixed(2)}x · ${today.pur} sale · belanja RM${today.spend.toFixed(0)}\n` +
        (cut ? "SG PAUSED. Dayparting cuba balik esok (hari jualan). Jimat duit, tak bakar." : "⚠️ Gagal pause — check manual.")
    );
    return NextResponse.json({ ok: true, action: "auto-cut", cut, today, yest });
  }

  const verdict =
    today.cpp > 0 && today.cpp <= CPP_OK
      ? "✅ SG efisien balik — CPP sihat, trim berjaya."
      : today.cpp >= CPP_BAD
        ? "⚠️ SG CPP masih MAHAL — pasu masih tepu, pertimbang trim lagi."
        : "🟡 SG sederhana — pantau.";

  const msg =
    `🇸🇬 <b>SG Watchdog</b>\n` +
    `CPP hari ni: <b>RM${today.cpp.toFixed(0)}</b> (semalam RM${yest.cpp.toFixed(0)})\n` +
    `ROAS ${today.roas.toFixed(2)}x · ${today.pur} sale · belanja RM${today.spend.toFixed(0)}\n` +
    `${verdict}`;
  await sendTelegram(msg);

  return NextResponse.json({ ok: true, today, yest, verdict });
}
