import { NextResponse } from "next/server";
import { fetchInsights, fetchCreativePerformance, summarize } from "@/lib/integrations/meta-ads";

export const dynamic = "force-dynamic";

// Data mentah insight Meta (campaign + ad) untuk analisa rugi/untung.
// Dilindungi CRON_SECRET.  GET /api/cron/ads-data?secret=XXX&range=maximum
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  const range = (url.searchParams.get("range") || "maximum") as
    | "today" | "yesterday" | "last_7d" | "last_14d" | "last_30d" | "maximum";
  try {
    const [campaigns, creatives] = await Promise.all([
      fetchInsights({ level: "campaign", datePreset: range }),
      fetchCreativePerformance({ datePreset: range }),
    ]);
    const summary = summarize(campaigns);
    const slim = (r: { id: string; name: string; status?: string; spend: number; purchases: number; purchaseValue: number; roas: number; costPerPurchase: number; ctr: number; impressions: number; convRate: number }) => ({
      name: r.name, status: r.status, spend: +r.spend.toFixed(2), purchases: r.purchases,
      sales: +r.purchaseValue.toFixed(2), roas: +r.roas.toFixed(2),
      cpp: +r.costPerPurchase.toFixed(2), ctr: +r.ctr.toFixed(2),
      impressions: r.impressions, convRate: +r.convRate.toFixed(2),
    });
    return NextResponse.json({
      ok: true, range, summary,
      campaigns: campaigns.map(slim),
      ads: creatives.map(slim),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
