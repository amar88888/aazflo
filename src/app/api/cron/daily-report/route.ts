import { NextRequest, NextResponse } from "next/server";
import { buildDailyReport } from "@/lib/report";
import { sendTelegram } from "@/lib/telegram";

// Dipanggil oleh cron (VPS crontab / cron-job.org) setiap hari SEBELUM 11:59 malam.
// Contoh crontab (11:30 malam MYT): 30 23 * * * curl -s "https://app.aazflo.com/api/cron/daily-report?secret=XXX"
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.nextUrl.searchParams.get("secret") || req.headers.get("x-cron-secret");
  if (secret && provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = await buildDailyReport();
  const result = await sendTelegram(report);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
