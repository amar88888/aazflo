import { NextResponse } from "next/server";
import { saveMetaToken } from "@/lib/integrations/meta-ads";

export const dynamic = "force-dynamic";

// Setup sekali Meta (token + app id + app secret) — dilindungi CRON_SECRET.
// Tukar token ke long-lived & simpan supaya auto-renew. Guna untuk setup awal.
//   GET /api/cron/setup-meta?secret=XXX&token=...&app_id=...&app_secret=...&ad_account=act_...
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  const token = url.searchParams.get("token") ?? "";
  const appId = url.searchParams.get("app_id") ?? "";
  const appSecret = url.searchParams.get("app_secret") ?? "";
  const adAccountId = url.searchParams.get("ad_account") ?? "";
  if (!token || !appId || !appSecret || !adAccountId) {
    return NextResponse.json({ ok: false, message: "Perlu token, app_id, app_secret, ad_account." }, { status: 400 });
  }
  try {
    const res = await saveMetaToken({ accessToken: token, adAccountId, appId, appSecret });
    return NextResponse.json({ ok: true, longLived: res.longLived });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
