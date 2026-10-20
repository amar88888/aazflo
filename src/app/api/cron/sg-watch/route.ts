import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";
const PUR = new Set(["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]);

// Ambang "sihat" SG (selepas trim RM700 + cap auto-profit RM800).
const CPP_OK = 50; // CPP <= ni = efisien (19 Okt SG RM43)
const CPP_BAD = 65; // CPP >= ni = mahal balik (20 Okt SG RM71 — tepu)

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
