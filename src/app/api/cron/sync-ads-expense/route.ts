import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchInsights } from "@/lib/integrations/meta-ads";

export const dynamic = "force-dynamic";

// Label tetap untuk perbelanjaan iklan yang di-sync automatik (supaya boleh dikenal & di-replace).
const AUTO_LABEL = "Meta Ads (auto)";

// Map nama campaign Meta → kedai (supaya boleh tolak iklan per kedai).
function campaignStore(name: string): string {
  const n = (name || "").toUpperCase();
  if (n.includes("MAXLIM")) return n.includes("SG") ? "maxlimsg" : "maxlim";
  if (n.includes("SG")) return "facelimsg";
  return "facelim"; // FACELIM MY (LIVE 5 OKT, TEST, RETARGET) + default
}

// Auto-sync perbelanjaan iklan Meta ke jadual Expense supaya P&L tolak kos iklan secara automatik.
// Tak perlu taip manual lagi — jalankan tiap beberapa jam (hari ni + semalam), atau backfill guna &days=N.
//
//   GET /api/cron/sync-ads-expense?secret=XXX           → sync hari ni (MYT)
//   GET /api/cron/sync-ads-expense?secret=XXX&days=30   → backfill 30 hari lepas
//
// Idempotent: untuk setiap hari, padam Expense auto lama → cipta semula dengan spend terkini.
// Jadi boleh dijalankan berkali-kali tanpa double-kira.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "1", 10) || 1, 1), 90);

  try {
    const results: { date: string; spend: number }[] = [];
    const now = new Date();

    // Ikut tarikh Malaysia (UTC+8), TERMASUK hari ni (i=0) supaya untung "Hari Ni" tolak iklan semasa.
    // days=2 → hari ni + semalam.
    const myt = new Date(now.getTime() + 8 * 3600 * 1000);
    for (let i = 0; i < days; i++) {
      const d = new Date(myt);
      d.setUTCDate(d.getUTCDate() - i);
      const ymd = d.toISOString().slice(0, 10);

      // Spend sebenar Meta per campaign → kumpul ikut KEDAI.
      const rows = await fetchInsights({ level: "campaign", since: ymd, until: ymd });
      const spend = rows.reduce((s, r) => s + (r.spend || 0), 0);
      const byStore = new Map<string, number>();
      for (const r of rows) {
        const store = campaignStore(r.name);
        byStore.set(store, (byStore.get(store) ?? 0) + (r.spend || 0));
      }

      const dayStart = new Date(`${ymd}T00:00:00.000Z`);
      const dayEnd = new Date(`${ymd}T23:59:59.999Z`);

      // Buang auto-expense lama (termasuk yang berlabel kedai) untuk hari ni — elak double-kira.
      await db.expense.deleteMany({
        where: { type: "ads", label: { startsWith: AUTO_LABEL }, date: { gte: dayStart, lte: dayEnd } },
      });

      // Satu baris Expense per kedai (label "Meta Ads (auto) [store]") supaya untung per kedai boleh tolak iklan.
      for (const [store, amt] of byStore) {
        if (amt <= 0) continue;
        await db.expense.create({
          data: {
            type: "ads",
            label: `${AUTO_LABEL} [${store}]`,
            amount: Math.round(amt * 100) / 100,
            platform: null,
            date: dayStart,
            recurring: false,
          },
        });
      }

      results.push({ date: ymd, spend: Math.round(spend * 100) / 100 });
    }

    const total = results.reduce((s, r) => s + r.spend, 0);
    return NextResponse.json({
      ok: true,
      synced: results.length,
      totalSpend: Math.round(total * 100) / 100,
      days: results,
      note: "Kos iklan Meta kini auto-masuk P&L. Jadualkan cron ini harian.",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
