import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";
import { getSetting, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";
const SG_CAMPAIGN = "120251751539750356"; // FACELIM SG - LIVE 7 OKT

// Hari orang SG BELI vs hari sepi — dari data CLEAN (buang hari billing-contaminated).
// JS getUTCDay: 0=Ahad,1=Isnin,2=Selasa,3=Rabu,4=Khamis,5=Jumaat,6=Sabtu.
//   Data clean: Rabu CPP10, Jumaat CPP12, Sabtu CPP18 (kuat); Khamis/Isnin medium; AHAD CPP74 (sepi).
//   Rabu/Khamis yg nampak "lemah" 21-22 Okt sebenarnya BILLING SANGKUT, bukan corak hari.
//   RUN  : Isnin-Sabtu (1-6)   REHAT: Ahad(0) sahaja — satu-satunya hari clean yg betul sepi.
//   Bleed-guard sebenar = SG watchdog (CPP real-time) + cap RM800, bukan label hari.
const RUN_DAYS = new Set([1, 2, 3, 4, 5, 6]);
const DAYNAME = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];

// 🇸🇬 SG DAYPARTING — hidupkan SG pada hari orang SG beli, rehatkan pada hari sepi.
// Jalan tiap hari 00:05 MYT (scheduler). Elak bleed pada hari CPP mahal.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const cfg = await getMetaCreds();
  if (!cfg) return NextResponse.json({ ok: false, message: "Meta belum di-setup" }, { status: 400 });
  const { accessToken } = cfg;

  // 🔒 SG HOLD — 25 Okt SG bakar RM410/hari utk 1-2 order sebenar. Kekal tutup sampai ada creative SG untung.
  // ?hold=1 kunci, ?hold=0 buka balik (owner setuju dulu).
  const holdParam = url.searchParams.get("hold");
  if (holdParam === "1" || holdParam === "0") await setSetting("sg_hold", holdParam);
  const hold = (await getSetting("sg_hold")) === "1";

  const day = new Date(Date.now() + 8 * 3600 * 1000).getUTCDay(); // hari MYT
  const shouldRun = RUN_DAYS.has(day) && !hold;

  const get = async () => {
    const r = await fetch(`${GRAPH}/${SG_CAMPAIGN}?fields=effective_status&access_token=${accessToken}`, { cache: "no-store" });
    return (await r.json()).effective_status as string;
  };
  const setStatus = async (status: string) => {
    const r = await fetch(`${GRAPH}/${SG_CAMPAIGN}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ status, access_token: accessToken }).toString(),
    });
    const j = await r.json();
    return r.ok && !j.error;
  };

  const cur = await get();
  let action = "no-change";
  if (shouldRun && cur !== "ACTIVE") {
    if (await setStatus("ACTIVE")) {
      action = "ON";
      await sendTelegram(`🇸🇬 <b>SG HIDUP</b> — ${DAYNAME[day]} (hari orang SG beli, CPP murah). Jom buat sale.`);
    }
  } else if (!shouldRun && cur === "ACTIVE") {
    if (await setStatus("PAUSED")) {
      action = "OFF";
      await sendTelegram(`🇸🇬 <b>SG REHAT</b> — ${DAYNAME[day]} (hari sepi, CPP mahal). Jimat duit, tak bakar.`);
    }
  }

  return NextResponse.json({ ok: true, day: DAYNAME[day], hold, shouldRun, wasStatus: cur, action });
}
