import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";
import { loadCredentials, saveCredentials } from "@/lib/credentials";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";

type Snap = { spend: number; at: number; lastAlert: number };

// 🧊 PENJAGA BELANJA BEKU — kesan bila iklan TERTIBA STOP deliver (belanja tak gerak)
// walaupun status account nampak "active". Ini tangkap kejadian 21 Okt: account
// UNSETTLED → delivery tercekik senyap → belanja beku seharian tanpa amaran.
// GET /api/cron/spend-watch?secret=XXX
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const cfg = await getMetaCreds();
  if (!cfg) return NextResponse.json({ ok: false, message: "Meta belum di-setup" }, { status: 400 });
  const { accessToken, adAccountId } = cfg;
  const gget = async (path: string, params: Record<string, string>) => {
    const qs = new URLSearchParams({ ...params, access_token: accessToken }).toString();
    return (await fetch(`${GRAPH}/${path}?${qs}`, { cache: "no-store" })).json();
  };

  // Belanja hari ni (account) + ada campaign aktif berbudget?
  const ins = await gget(`${adAccountId}/insights`, { level: "account", date_preset: "today", fields: "spend" });
  const spendNow = parseFloat(ins.data?.[0]?.spend ?? "0");
  const camps = await gget(`${adAccountId}/campaigns`, { fields: "effective_status", effective_status: "['ACTIVE']", limit: "100" });
  const hasActive = (camps.data ?? []).length > 0;
  const acct = await gget(`${adAccountId}`, { fields: "balance" });
  const owed = (Number(acct.balance) || 0) / 100;

  const now = Date.now();
  const mytHour = new Date(now + 8 * 3600 * 1000).getUTCHours();
  const activeHours = mytHour >= 10 && mytHour <= 22;

  const snap = (await loadCredentials<Snap>("spend_watch")) ?? { spend: 0, at: 0, lastAlert: 0 };
  const elapsedMin = snap.at ? (now - snap.at) / 60000 : 0;
  const delta = spendNow - snap.spend;

  let alerted = false;
  // STALL = jam aktif + ada campaign aktif + dah lepas sejam + belanja hampir tak gerak (bukan reset hari baru)
  const stalled = activeHours && hasActive && snap.at > 0 && elapsedMin >= 45 && delta >= 0 && delta < 10;
  if (stalled && now - snap.lastAlert > 2 * 3600 * 1000) {
    await sendTelegram(
      `🧊 <b>IKLAN BEKU — belanja TAK GERAK</b>\n` +
        `Belanja ${Math.round(elapsedMin)} min lepas: +RM${delta.toFixed(0)} je (beku).\n` +
        `Tertunggak: RM${owed.toFixed(0)}.\n` +
        `Kemungkinan payment/delivery tercekik. Buka Ads Manager → <b>Pay Now</b> & semak delivery. 💳`
    );
    snap.lastAlert = now;
    alerted = true;
  }

  await saveCredentials("spend_watch", { spend: spendNow, at: now, lastAlert: snap.lastAlert });

  return NextResponse.json({ ok: true, spendNow, delta: Math.round(delta), elapsedMin: Math.round(elapsedMin), activeHours, hasActive, owed, stalled, alerted });
}
