import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchStripeFees } from "@/lib/integrations/stripe";

export const dynamic = "force-dynamic";

const AUTO_LABEL = "Stripe fees (auto)";

// Auto-sync fees Stripe (kos pemprosesan kad) ke Expense supaya P&L tolak kos kad.
// Fees dikira dalam MYR (akaun base). Idempotent per hari.
//   GET /api/cron/sync-stripe?secret=XXX[&days=1]
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "1", 10) || 1, 1), 90);

  try {
    const results: { date: string; fee: number }[] = [];
    const now = new Date();

    for (let i = 1; i <= days; i++) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const ymd = d.toISOString().slice(0, 10);
      const dayStart = new Date(`${ymd}T00:00:00.000Z`);
      const dayEnd = new Date(`${ymd}T23:59:59.999Z`);

      const feeRows = await fetchStripeFees({ from: dayStart, to: dayEnd });
      // Base akaun MYR — ambil fee MYR (kalau ada SGD dsb, Stripe convert ke base MYR dlm balance txn).
      const feeSen = feeRows.reduce((s, r) => s + r.fee, 0);
      const feeRM = Math.round(feeSen) / 100;

      await db.expense.deleteMany({
        where: { type: "other", label: AUTO_LABEL, date: { gte: dayStart, lte: dayEnd } },
      });
      if (feeRM > 0) {
        await db.expense.create({
          data: { type: "other", label: AUTO_LABEL, amount: feeRM, platform: null, date: dayStart, recurring: false },
        });
      }
      results.push({ date: ymd, fee: feeRM });
    }

    const total = results.reduce((s, r) => s + r.fee, 0);
    return NextResponse.json({
      ok: true,
      synced: results.length,
      totalFeesRM: Math.round(total * 100) / 100,
      days: results,
      note: "Fees Stripe kini auto-tolak dalam P&L.",
    });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
