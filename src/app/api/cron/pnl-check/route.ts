import { NextResponse } from "next/server";
import { getPnlData } from "@/lib/queries";
import { startOfDayMY, endOfDayMY } from "@/lib/myt";

export const dynamic = "force-dynamic";

// 🔎 Semak P&L ikut tarikh (MYT) — untuk sahkan untung bersih & belanja iklan betul-betul tolak.
// GET /api/cron/pnl-check?secret=XXX&date=2026-10-19
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  // Tengah hari UTC supaya pasti dalam hari MYT yang betul.
  const anchor = new Date(`${date}T12:00:00.000Z`);
  const ds = startOfDayMY(anchor);
  const de = endOfDayMY(anchor);
  const p = await getPnlData(ds, de);
  return NextResponse.json({
    ok: true,
    date,
    rangeUTC: { from: ds.toISOString(), to: de.toISOString() },
    revenue: p.revenue,
    cogs: p.cogs,
    shipping: p.shipping,
    adsSpend: p.adsSpend,
    netProfit: p.netProfit,
    note: "netProfit sepatutnya = revenue - cogs - shipping - fees - adsSpend",
  });
}
