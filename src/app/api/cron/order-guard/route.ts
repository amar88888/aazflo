import { NextResponse } from "next/server";
import { runOrderGuard, formatGuard } from "@/lib/order-guard";
import { sendTelegram } from "@/lib/telegram";

// Pengawal order: ?send=1 hantar Telegram bila ada isu BARU (atau tersangkut/salah-kedai berulang tiap 6 jam).
// ?force=1 hantar walaupun tiada perubahan. Tanpa send → pulang JSON je.
type GuardState = { sent: Set<string>; lastAt: number };

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  const { issues, errors, scanned } = await runOrderGuard();

  const g = globalThis as { __orderGuard?: GuardState };
  const st = (g.__orderGuard ??= { sent: new Set(), lastAt: 0 });
  const fresh = issues.filter((i) => !st.sent.has(i.key));
  const urgent = issues.some((i) => i.kind !== "berganda");
  const due = urgent && Date.now() - st.lastAt > 6 * 3600_000;

  let sent = false;
  const wantSend = url.searchParams.get("send") === "1";
  const force = url.searchParams.get("force") === "1";
  if ((wantSend && (fresh.length > 0 || due)) || force) {
    if (issues.length || errors.length || force) {
      const r = await sendTelegram(issues.length || errors.length ? formatGuard(issues, errors) : "🛡️ Pengawal Order: semua bersih ✓");
      sent = r.ok;
      if (r.ok) {
        st.lastAt = Date.now();
        for (const i of issues) st.sent.add(i.key);
      }
    }
  }
  return NextResponse.json({ ok: errors.length === 0, scanned, sent, issues, errors });
}
