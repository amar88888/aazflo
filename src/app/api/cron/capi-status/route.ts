import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

// 🔎 Status Meta CAPI — event Purchase terakhir yang dihantar dari server (dari woo-webhook).
// GET /api/cron/capi-status?secret=XXX
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const last = await getSetting("capi_last");
  return NextResponse.json({ ok: true, last: last ? JSON.parse(last) : null });
}
