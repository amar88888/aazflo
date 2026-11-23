import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";
import { getSetting, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";

// ── Peraturan (deterministik, bukan agak-agak) ──
// Meta over-report ~1.8x; breakeven sebenar ~1.65x → breakeven Meta-ROAS ~3.0x.
const ROAS_PAUSE = 2.5;      // bawah ni (selepas belanja cukup) = rugi → pause
const ROAS_SCALE = 3.8;      // atas ni (Meta ~3.8 = sebenar ~2.1x, untung kukuh) = scale winner lebih agresif
const SPEND_PAUSE_3D = 100;  // RM belanja 3 hari sebelum layak dinilai utk pause
const SPEND_TODAY_DEAD = 60; // RM belanja hari ni + 0 jualan = pause (turun 80→60, potong dud lebih awal)
const SPEND_SCALE_3D = 300;  // RM belanja 3 hari (volume terbukti) sebelum scale
const SCALE_STEP = 1.2;      // naik +20% je (selamat)
// FASA STABIL (24 Okt): 16-19 Okt untung bersih RM1,388-1,767 bila belanja <= RM2.6k (MY RM700-1,150 ROAS 3.8-4.4x).
// 20-23 Okt belanja RM3k+ (auto-scale +20%/2jam) → untung jatuh RM462-994. Kunci dulu sweet spot; naikkan cap
// bila untung stabil RM1,100+ dan ada winner baru (fasa naik ke RM2,000-2,500).
const CAP_TOTAL = 2100;      // cap budget harian semua adset (RM)
const SG_ADSET_CAP = 300;    // cap SG — 13 Nov owner: "jgn naikkan takut koyak" TAPI "jgn kunci habis kalau untung" → had RM300
const SG_SCALE_ROAS_MULT = 1.4; // SG mesti ROAS hari ni ≥ SCALE_TODAY_MIN×1.4 (lebih ketat dari MY) baru boleh naik
// SG naik MAKSIMUM SEKALI sehari (+20%) — 12 Nov dulu naik tiap 2 jam RM150→600 dalam sehari.
// Cap ikut adset (id) — MY sweet spot RM700-1,150; TEST tak di-scale (tugas dia cari winner, bukan volume).
const ADSET_CAP: Record<string, number> = {
  // 26 Okt (owner setuju): RM100 MY→TEST. Testimoni Hitam penat (CPP RM60), winner IMG_5312 jalan dlm TEST (CPP RM30);
  // salinan dlm MY belum ambil (RM107/order). Jumlah kekal RM1,200.
  // 27 Okt: adset MY penat — winner IMG_5312 yg hidup RM28 dlm TEST jadi RM108 bila disalin ke MY (audience MY jemu).
  // Alih berat ke TEST (di mana creative baru convert). Jumlah kekal RM1,200.
  "120251722984390356": 800, // FACELIM MY broad — WINNER STACK 6 Nov: 9 video proven (≥2.0 + rested winners), naik 600→800
  "120251768506270356": 600, // TEST broad MY - creative hunt (kini CBO campaign paused; cap tinggal utk rujukan)
  // 13 Nov (owner): "jgn naikkan takut koyak" + "jgn kunci habis kalau untung" — 12 Nov auto-scale bawa SG RM150→600.
  "120251862729740356": 300, // FACELIM SG - broad SG (naik sekali sehari je, ROAS ketat)
};
const SCALE_TODAY_MIN = 2.5; // jangan scale kalau ROAS HARI NI < ni (Meta) walau 3-hari bagus — elak scale masa burn (cth catch-up lepas billing)
// Ambang di atas dikira bila Purchase BERGANDA (PixelYourSite broadcast fbq('track') ke pixel iklan → ~2x order).
// 24 Okt PixelYourSite dimatikan di facelim.com & facelimsg.com → pixel MY & SG kini 1x; semua ambang × 0.5.
const pixelFactor = (_adsetName: string) => 0.5;
const SCALE_TODAY_SPEND_MIN = 100; // RM belanja hari ni minimum sebelum layak scale (ROAS hari ni mesti ada bukti)
// ── Tampung bocor 27 Okt (−RM137): winner pause + duit ke CPP RM78 ──
const SPEND_BLEED_TODAY = 120;  // RM bakar hari ni sebelum nilai ad "mahal walau ada jualan"
const CPP_BLEED_TODAY = 55;     // CPP hari ni (Meta) atas ni = rugi dalam (AOV ~RM61) walau ada jualan — potong
// 15 Nov: champion SG tak boleh di-pause peringkat ad (11 & 14 Nov flop sebab dia ter-OFF). Sama dgn SG_CHAMPIONS di sg-watch.
const NEVER_PAUSE_ADS = new Set(["120251862751940356"]); // FACELIM SG - IMG_6851 pemenang
const CPP_BLEED_TODAY_SG = 110; // SG AOV ~SGD55-60 (≈RM180) → had CPP lain (bukan had MY)
const WINNER_PUR_3D = 10;       // ≥ ni sale 3 hari + CPP 3hr dlm had = winner terbukti → tak dipotong sebab "mahal hari ni"
const EXPENSIVE_MIN_HOUR_MYT = 14; // rule "mahal hari ni" hanya lepas 2 petang MYT (pagi = catch-up burn + lag atribusi)
// Auto-hidupkan winner TERBUKTI yg dah REHAT (elak budget bocor ke creative lemah bila winner ter-pause)
const REVIVE_PUR_14D = 30;      // pembelian 14 hari minimum = winner terbukti (ambang tinggi; 14d separa pixel-berganda)
const REVIVE_ROAS_14D = 2.5;    // ROAS 14 hari minimum = untung terbukti
const REVIVE_RESTED_SPEND_3D = 20; // < ni belanja 3 hari = dah REHAT (bukan baru fatigue — IMG_6849 RM238/3hr ditolak)
const REVIVE_MAX = 1;           // hidupkan max 1 winner rehat tiap larian (lembut, pause-logic jaga kalau bakar balik)
// ── ALERT STRUKTUR (6 Nov 2026): owner kena sendiri perasan "broad 1 video je" — tutup lubang. Alert je, tak sentuh budget. ──
const MY_BROAD_ADSET = "120251722984390356"; // FACELIM MY broad (adset scaling utama)
const MIN_BROAD_WINNERS = 5;    // broad utama di bawah ni = kurang video, risiko bergantung 1-2 creative penat → jerit
const IDLE_WINNER_PUR_14D = 10; // winner terbukti (14hr) yg PAUSED tapi adset hidup = boleh jalan tapi terperuk → cadang
const IDLE_WINNER_ROAS_14D = 2.0;
// ── CBO: potong ANGLE (adset) mati — budget di campaign, satu angle boleh sedut budget winner ──
// 29 Okt 2026: A4 Testimoni RM116/3hr + RM72 hari ni, 0 jualan, terlepas sebab pause-ad nilai per-IKLAN & lindung 2 iklan/adset.
const ADSET_BLEED_TODAY = 50;   // adset CBO bakar >= ni hari ni + 0 jualan (& ada sejarah) = angle mati → pause adset
const ADSET_BLEED_HIST_3D = 40; // mesti ada sejarah belanja 3hr >= ni (elak bunuh angle baru masa lag pagi)
const CBO_MIN_ALIVE = 2;        // sentiasa simpan >= 2 angle hidup tiap campaign CBO

// ── MOD HANIS (24 Nov 2026, owner: "try lah kalau tak ngam kita balik ke asal") ──
// Suis: setting `engine_mode` = "hanis" (default) | "lama". Tukar: GET ?secret=..&mode=lama → terus balik engine asal.
// Beza dgn engine lama:
//  1) SCALE lembut: +15% (bukan +20%), tunggu 72 jam antara naik; untung jatuh lepas naik → PATAH BALIK.
//  2) PAGI 06:xx: ROAS 3 hari adset ≤ breakeven → turun bajet 20% (tutup lubang bleed malam, 8 Nov).
//  3) PETANG 14:00-20:59: CPA hari ni terlalu tinggi → bajet −25% HARI TU (pulih pagi esok jika 3-hari sihat),
//     GANTI pause-iklan "mahal hari ni" (pernah bunuh winner IMG_0623 13 Nov).
const HANIS_SCALE_STEP = 1.15;
const HANIS_SCALE_WAIT_H = 72;
const HANIS_ROLLBACK_DROP = 0.8;     // ROAS semalam < 80% ROAS sebelum naik → patah balik
const BREAKEVEN_META_ROAS = 1.65;    // breakeven sebenar 1.65x (pixel kini 1x selepas PixelYourSite dimatikan)
const HANIS_MORNING_CUT = 0.8;       // pagi: −20%
const HANIS_AFTERNOON_CUT = 0.75;    // petang: −25%
const HANIS_MIN_BUDGET = 50;         // jangan turun bawah RM50
const HANIS_MORNING_HOUR = 6;
const HANIS_AFTERNOON_FROM = 14;
const HANIS_AFTERNOON_TO = 20;

type AdRow = { id: string; name: string; status: string; adsetId: string; adsetName: string; campId: string; budget: number; spend3: number; pur3: number; roas3: number; spendToday: number; purToday: number };

function purchasesOf(actions: { action_type: string; value: string }[] | undefined): number {
  let p = 0;
  for (const a of actions || []) if (a.action_type.includes("purchase")) p = Math.max(p, Math.round(parseFloat(a.value)));
  return p;
}
function valueOf(av: { action_type: string; value: string }[] | undefined): number {
  let v = 0;
  for (const a of av || []) if (a.action_type.includes("purchase")) v = Math.max(v, parseFloat(a.value));
  return v;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  // dryrun default TRUE — hanya bertindak bila &dryrun=0
  const dryrun = url.searchParams.get("dryrun") !== "0";

  const cfg = await getMetaCreds();
  if (!cfg || !cfg.accessToken || !cfg.adAccountId) return NextResponse.json({ ok: false, message: "Meta belum di-setup" }, { status: 400 });
  const { accessToken, adAccountId } = cfg;

  const gget = async (path: string, params: Record<string, string>) => {
    const qs = new URLSearchParams({ ...params, access_token: accessToken }).toString();
    const r = await fetch(`${GRAPH}/${path}?${qs}`, { cache: "no-store" });
    return r.json();
  };
  const gpost = async (path: string, body: Record<string, string>) => {
    const r = await fetch(`${GRAPH}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...body, access_token: accessToken }).toString(),
    });
    const j = await r.json();
    return r.ok && !j.error ? { ok: true } : { ok: false, error: j.error?.error_user_msg || j.error?.message || "gagal" };
  };

  try {
    const actions: string[] = [];
    // Suis mod engine (rollback segera tanpa deploy)
    const modeParam = url.searchParams.get("mode");
    if (modeParam === "hanis" || modeParam === "lama") await setSetting("engine_mode", modeParam);
    const mode = ((await getSetting("engine_mode")) ?? "hanis") === "lama" ? "lama" : "hanis";
    const nowMytH = new Date(Date.now() + 8 * 3600 * 1000);
    // Ujian: ?hour=6 / ?hour=15 HANYA dlm dry-run (simulasi semakan pagi/petang tanpa ubah apa-apa)
    const hourOverride = dryrun ? parseInt(url.searchParams.get("hour") ?? "", 10) : NaN;
    const hourMytH = Number.isFinite(hourOverride) ? hourOverride : nowMytH.getUTCHours();
    const todayMytH = nowMytH.toISOString().slice(0, 10);
    // ── 🇸🇬 SG SELF-HEAL — SG = engine untung #1 (ROAS 4-5x, AOV ~RM193). Selalu ter-pause pada hari jualan sebab ──
    // job tengah malam (resume-ads 00:01 / dayparting 00:05) MISS bila server tidur/restart waktu malam (takde traffic).
    // Auto-profit jalan tiap 2 jam → pastikan SG ON pada PAGI hari jualan (Isnin-Sabtu). PAGI je supaya tak lawan
    // sg-watch (yg cut SG petang bila betul-betul bleeding). Hormati sg_hold (kunci manual owner).
    const SG_CAMPAIGN_HEAL = "120251751539750356";
    let sgHealthAlert: string | null = null;
    try {
      const nowMyt = new Date(Date.now() + 8 * 3600 * 1000);
      const hourMyt = nowMyt.getUTCHours();
      const dayMyt = nowMyt.getUTCDay(); // 0=Ahad
      const sgCutToday = (await getSetting("sg_cut_day")) === nowMyt.toISOString().slice(0, 10); // sg-watch potong hari ni
      const sgHold = (await getSetting("sg_hold")) === "1" || sgCutToday;
      const sgRunDay = dayMyt !== 0; // Ahad rehat (hari sepi SG)
      if (sgRunDay && !sgHold) {
        const sgStatus = (await gget(SG_CAMPAIGN_HEAL, { fields: "effective_status" })).effective_status as string | undefined;
        if (sgStatus && sgStatus !== "ACTIVE") {
          if (hourMyt < 12) {
            // Pagi hari jualan + SG mati = job malam miss → hidupkan balik
            if (!dryrun) await gpost(SG_CAMPAIGN_HEAL, { status: "ACTIVE" });
            actions.push(`${dryrun ? "[DRY] " : ""}🇸🇬 SG HIDUP BALIK — engine untung ter-pause pagi hari jualan (job malam miss)`);
          } else {
            // Petang: mungkin sg-watch cut atas sebab betul — jangan paksa, tapi ALERT owner supaya sedar
            sgHealthAlert = `🇸🇬 SG OFF pada ${["Ahad","Isnin","Selasa","Rabu","Khamis","Jumaat","Sabtu"][dayMyt]} petang — kalau bukan sg-watch cut, hidupkan balik (engine untung #1).`;
          }
        }
      }
    } catch (e) {
      actions.push(`⚠️ SG self-heal gagal: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Ambil semua ad aktif + adset (budget) + insight 3 hari & hari ni
    const fields =
      "id,name,effective_status,adset{id,name,daily_budget,effective_status},campaign{id,name}," +
      "insights.date_preset(last_3d){spend,actions,action_values}";
    const adsRes = await gget(`${adAccountId}/ads`, { fields, limit: "300", effective_status: "['ACTIVE']" });
    const todayRes = await gget(`${adAccountId}/ads`, {
      fields: "id,insights.date_preset(today){spend,actions,action_values}",
      limit: "300",
      effective_status: "['ACTIVE']",
    });
    const todayMap = new Map<string, { spend: number; pur: number; val: number }>();
    for (const a of todayRes.data || []) {
      const ins = a.insights?.data?.[0];
      todayMap.set(a.id, { spend: ins ? parseFloat(ins.spend || "0") : 0, pur: purchasesOf(ins?.actions), val: valueOf(ins?.action_values) });
    }

    const ads: AdRow[] = [];
    const activePerAdset = new Map<string, number>();
    for (const a of adsRes.data || []) {
      const ins = a.insights?.data?.[0];
      const spend3 = ins ? parseFloat(ins.spend || "0") : 0;
      const pur3 = purchasesOf(ins?.actions);
      const val3 = valueOf(ins?.action_values);
      const t = todayMap.get(a.id) || { spend: 0, pur: 0 };
      const adsetId = a.adset?.id ?? "";
      activePerAdset.set(adsetId, (activePerAdset.get(adsetId) ?? 0) + 1);
      ads.push({
        id: a.id, name: a.name, status: a.effective_status, adsetId, adsetName: a.adset?.name ?? "", campId: a.campaign?.id ?? "",
        budget: a.adset?.daily_budget ? parseInt(a.adset.daily_budget) / 100 : 0,
        spend3, pur3, roas3: spend3 > 0 ? val3 / spend3 : 0, spendToday: t.spend, purToday: t.pur,
      });
    }

    // Budget SEBENAR semua adset aktif (authoritative — utk cap yang tepat)
    const adsetRes = await gget(`${adAccountId}/adsets`, { fields: "id,name,daily_budget", limit: "200", effective_status: "['ACTIVE']" });
    const budgetById = new Map<string, number>();
    let totalBudget = 0;
    for (const s of adsetRes.data || []) {
      const b = s.daily_budget ? parseInt(s.daily_budget) / 100 : 0;
      budgetById.set(s.id, b);
      totalBudget += b;
    }


    // ── 0) PENJAGA BUDGET — adset atas had (kod lama, manual, Meta) → turun balik ke had ──
    // 24 Okt: deploy terlepas → MY naik RM1,800 semalaman tanpa sesiapa sedar.
    for (const s of adsetRes.data || []) {
      const b = budgetById.get(s.id) ?? 0;
      const cap = ADSET_CAP[s.id] ?? (/sg/i.test(s.name || "") ? SG_ADSET_CAP : CAP_TOTAL);
      if (b <= cap) continue;
      if (!dryrun) {
        const r = await gpost(s.id, { daily_budget: String(cap * 100) });
        if (!r.ok) { actions.push(`❌ turun budget gagal "${String(s.name).slice(0, 24)}": ${r.error}`); continue; }
        budgetById.set(s.id, cap);
        totalBudget -= b - cap;
      }
      actions.push(`${dryrun ? "[DRY] " : ""}🛡️ BUDGET "${String(s.name).slice(0, 30)}" RM${b}→RM${cap} (atas had)`);
    }

    // Adset yang ada ad aktif (calon scale)
    const adsetBudget = new Map<string, { name: string; budget: number }>();
    for (const a of ads) if (!adsetBudget.has(a.adsetId)) adsetBudget.set(a.adsetId, { name: a.adsetName, budget: budgetById.get(a.adsetId) ?? a.budget });

    // ── A) PAUSE iklan rugi — SELAMAT (19 Okt): automasi penuh tapi MUSTAHIL bunuh winner/kosongkan adset ──
    // Lindung TOP 2 ad (ROAS 3-hari tertinggi) tiap adset; mesti tinggal >= 2 ad hidup;
    // pause ikut ROAS 3-HARI sahaja (bukan "0 jualan hari ni" — lag attribution boleh tipu winner).
    const byAdset = new Map<string, typeof ads>();
    for (const a of ads) {
      if (a.status !== "ACTIVE") continue;
      byAdset.set(a.adsetId, [...(byAdset.get(a.adsetId) ?? []), a]);
    }
    // Kira sebab-potong tiap ad (robust pakai CPP, elak kalibrasi ROAS/pixel yg kabur).
    const flagOf = (a: AdRow) => {
      const pf = pixelFactor(a.adsetName);
      const cppToday = a.purToday > 0 ? a.spendToday / a.purToday : Infinity;
      const loser3d = a.spend3 >= SPEND_PAUSE_3D && a.roas3 < ROAS_PAUSE * pf; // rugi SAH 3 hari
      const deadToday = a.spendToday >= SPEND_TODAY_DEAD && a.purToday === 0 && a.roas3 < 1.0 * pf; // 0 jualan + bukan winner lag
      // MAHAL HARI NI: ada jualan tapi CPP terlalu tinggi (cth Testimoni Hitam RM78) — rugi walau ada sale
      // 14 Nov 2026 FIX: rule ni bunuh IMG_0623 (17 sale 12 Nov) pukul 10 pagi & SG IMG_6851 pemenang malam —
      // MY jatuh 1.39x. Sebab: (1) pagi = burn catch-up + lag atribusi, (2) SG AOV ~RM180 tapi guna CPP had MY,
      // (3) winner terbukti 3-hari tak patut dibunuh atas satu hari mahal.
      const isSgAd = /sg/i.test(a.adsetName);
      const cppLimit = isSgAd ? CPP_BLEED_TODAY_SG : CPP_BLEED_TODAY;
      const cpp3 = a.pur3 > 0 ? a.spend3 / a.pur3 : Infinity;
      const provenWinner = a.pur3 >= WINNER_PUR_3D && cpp3 <= cppLimit;
      const hourMytNow = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
      // Mod Hanis: "mahal hari ni" diurus peringkat ADSET (bajet −25%), bukan pause iklan.
      const expensiveToday = mode === "lama" && !provenWinner && hourMytNow >= EXPENSIVE_MIN_HOUR_MYT &&
        a.spendToday >= SPEND_BLEED_TODAY && a.purToday > 0 && cppToday > cppLimit;
      return { loser3d, deadToday, expensiveToday, bleeding: deadToday || expensiveToday, cppToday };
    };
    for (const [, group] of byAdset) {
      const ranked = [...group].sort((x, y) => y.roas3 - x.roas3);
      // Lindung 2 ad terbaik (ROAS 3-hari) TAPI jangan lindung yg tengah BAKAR hari ni (winner fatigue ≠ dilindungi).
      const protectedTop = new Set(ranked.filter((a) => !flagOf(a).bleeding).slice(0, 2).map((a) => a.id));
      let activeLeft = group.length;
      for (const a of ranked) {
        if (activeLeft <= 2) break; // sentiasa simpan >= 2 ad hidup
        if (protectedTop.has(a.id)) continue;
        if (NEVER_PAUSE_ADS.has(a.id)) continue; // champion SG — sg-watch yg jaga (cut peringkat campaign)
        const f = flagOf(a);
        if (!f.loser3d && !f.deadToday && !f.expensiveToday) continue;
        if (!dryrun) {
          const r = await gpost(a.id, { status: "PAUSED" });
          if (!r.ok) { actions.push(`❌ pause gagal "${a.name.slice(0, 24)}": ${r.error}`); continue; }
        }
        activeLeft--;
        const why = f.expensiveToday
          ? `CPP RM${f.cppToday.toFixed(0)} hari ni (bakar RM${a.spendToday.toFixed(0)})`
          : f.deadToday
          ? `RM${a.spendToday.toFixed(0)} hari ni 0 jualan (dud)`
          : `3hr ROAS ${a.roas3.toFixed(1)}x (rugi)`;
        actions.push(`${dryrun ? "[DRY] " : ""}⏸️ PAUSE "${a.name.slice(0, 30)}" — ${why}, bukan winner`);
      }
    }

    // ── A1) CBO: POTONG ANGLE MATI (peringkat adset) ──
    // Dlm CBO budget di CAMPAIGN — satu angle (adset) boleh bakar RM50+ 0 jualan sambil sedut budget
    // dari angle winner. Pause-ad (atas) TAK tangkap: ia nilai per-IKLAN & lindung 2 iklan/adset.
    // 29 Okt: A4 Testimoni RM116/3hr + RM72 hari ni 0 jualan → terlepas; owner "takkan sampai berdarah baru tutup".
    // Keselamatan: simpan >= 2 angle hidup/campaign; lindung 2 adset ROAS-3hr tertinggi; angle baru (tiada sejarah) tak dipotong.
    type AdsetAgg = { id: string; name: string; campId: string; isCbo: boolean; spendToday: number; purToday: number; spend3: number; wroas3: number };
    const aggByAdset = new Map<string, AdsetAgg>();
    for (const a of ads) {
      if (a.status !== "ACTIVE") continue;
      const cur = aggByAdset.get(a.adsetId) ?? { id: a.adsetId, name: a.adsetName, campId: a.campId, isCbo: (budgetById.get(a.adsetId) ?? 0) === 0, spendToday: 0, purToday: 0, spend3: 0, wroas3: 0 };
      cur.spendToday += a.spendToday; cur.purToday += a.purToday;
      cur.spend3 += a.spend3; cur.wroas3 += a.roas3 * a.spend3;
      aggByAdset.set(a.adsetId, cur);
    }
    const roas3Of = (s: AdsetAgg) => (s.spend3 > 0 ? s.wroas3 / s.spend3 : 0);
    const cboByCamp = new Map<string, AdsetAgg[]>(); // adset tanpa budget sendiri + tengah belanja = CBO
    for (const s of aggByAdset.values()) if (s.isCbo && s.spendToday > 0) cboByCamp.set(s.campId, [...(cboByCamp.get(s.campId) ?? []), s]);
    for (const [, group] of cboByCamp) {
      if (group.length <= CBO_MIN_ALIVE) continue; // tak cukup angle utk potong selamat
      const pf = pixelFactor(group[0]?.name ?? "");
      const ranked = [...group].sort((x, y) => roas3Of(y) - roas3Of(x));
      const protectedTop = new Set(ranked.slice(0, 2).map((s) => s.id)); // 2 angle ROAS-3hr terbaik dilindung
      let aliveLeft = group.length;
      for (const s of ranked) {
        if (aliveLeft <= CBO_MIN_ALIVE) break;
        if (protectedTop.has(s.id)) continue;
        const r3 = roas3Of(s);
        const loser3d = s.spend3 >= SPEND_PAUSE_3D && r3 < ROAS_PAUSE * pf; // angle terbukti rugi 3 hari
        const deadToday = s.spendToday >= ADSET_BLEED_TODAY && s.purToday === 0 && s.spend3 >= ADSET_BLEED_HIST_3D && r3 < 1.0 * pf;
        if (!loser3d && !deadToday) continue;
        if (!dryrun) {
          const r = await gpost(s.id, { status: "PAUSED" });
          if (!r.ok) { actions.push(`❌ potong angle gagal "${s.name.slice(0, 24)}": ${r.error}`); continue; }
        }
        aliveLeft--;
        const why = loser3d ? `3hr ROAS ${r3.toFixed(1)}x rugi (RM${s.spend3.toFixed(0)})` : `RM${s.spendToday.toFixed(0)} hari ni 0 jualan`;
        actions.push(`${dryrun ? "[DRY] " : ""}⏸️ POTONG ANGLE "${s.name.slice(0, 30)}" (CBO) — ${why}`);
      }
    }

    // ── A2) HIDUPKAN BALIK winner TERBUKTI yg dah REHAT ──
    // 27 Okt: IMG_6851 (108 jualan 7hr, CPP RM27) ter-pause 3 hari → budget mengalir ke CPP RM78 = −RM137.
    // Fix: cari ad PAUSED, adset masih hidup, volume+ROAS 14-hari terbukti, dah rehat (bukan baru fatigue) → ON balik.
    const revived: string[] = [];
    const idleWinners: { name: string; pur: number; roas: number }[] = [];
    try {
      const pausedRes = await gget(`${adAccountId}/ads`, {
        fields: "id,name,adset{id,name,effective_status},insights.date_preset(last_14d){spend,actions,action_values}",
        limit: "300", effective_status: "['PAUSED']",
      });
      const restRes = await gget(`${adAccountId}/ads`, {
        fields: "id,insights.date_preset(last_3d){spend}", limit: "300", effective_status: "['PAUSED']",
      });
      const rest3 = new Map<string, number>();
      for (const a of restRes.data || []) rest3.set(a.id, parseFloat(a.insights?.data?.[0]?.spend || "0"));
      type Cand = { id: string; name: string; adsetName: string; pur14: number; roas14: number };
      const cands: Cand[] = [];
      for (const a of pausedRes.data || []) {
        if (a.adset?.effective_status !== "ACTIVE") continue; // adset kena hidup supaya ad betul-betul serve
        const ins = a.insights?.data?.[0];
        const spend14 = ins ? parseFloat(ins.spend || "0") : 0;
        const pur14 = purchasesOf(ins?.actions);
        const roas14 = spend14 > 0 ? valueOf(ins?.action_values) / spend14 : 0;
        const rested = (rest3.get(a.id) ?? 0) < REVIVE_RESTED_SPEND_3D; // IMG_6849 RM238/3hr → ditolak
        if (pur14 >= REVIVE_PUR_14D && roas14 >= REVIVE_ROAS_14D && rested) {
          cands.push({ id: a.id, name: a.name, adsetName: a.adset?.name ?? "", pur14, roas14 });
        }
        // Alert (bukan tindakan): winner terbukti tapi PAUSED dlm adset hidup = boleh jalan, terperuk
        if (pur14 >= IDLE_WINNER_PUR_14D && roas14 >= IDLE_WINNER_ROAS_14D) idleWinners.push({ name: a.name, pur: pur14, roas: roas14 });
      }
      cands.sort((x, y) => y.roas14 - x.roas14);
      for (const c of cands.slice(0, REVIVE_MAX)) {
        if (!dryrun) {
          const r = await gpost(c.id, { status: "ACTIVE" });
          if (!r.ok) { actions.push(`❌ hidup gagal "${c.name.slice(0, 24)}": ${r.error}`); continue; }
        }
        revived.push(c.id);
        actions.push(`${dryrun ? "[DRY] " : ""}🔆 HIDUP "${c.name.slice(0, 30)}" — winner rehat (14hr ${c.pur14} jualan, ROAS ${c.roas14.toFixed(1)}x)`);
      }
    } catch (e) {
      actions.push(`⚠️ semak revive gagal: ${e instanceof Error ? e.message : String(e)}`);
    }

    // ── H) MOD HANIS — kawal bajet peringkat ADSET (ABO sahaja; CBO bajet di campaign → tak disentuh) ──
    const touchedToday = new Set<string>(); // adset yg bajet dah diubah larian ni → jangan scale
    type ScaleRec = { from: number; to: number; at: number; roasBefore: number };
    type CutRec = { from: number; date: string };
    const parseJson = <T,>(s: string | null): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };
    const setBudget = async (id: string, rm: number) => (dryrun ? { ok: true } : gpost(id, { daily_budget: String(Math.round(rm) * 100) }));
    if (mode === "hanis") {
      const yRes = await gget(`${adAccountId}/adsets`, {
        fields: "id,insights.date_preset(yesterday){spend,action_values}", limit: "200", effective_status: "['ACTIVE']",
      });
      const yRoas = new Map<string, { spend: number; roas: number }>();
      for (const s of yRes.data || []) {
        const ins = s.insights?.data?.[0];
        const sp = ins ? parseFloat(ins.spend || "0") : 0;
        yRoas.set(s.id, { spend: sp, roas: sp > 0 ? valueOf(ins?.action_values) / sp : 0 });
      }
      const agg = (id: string) => {
        const xs = ads.filter((a) => a.adsetId === id);
        const spend3 = xs.reduce((s, a) => s + a.spend3, 0);
        const val3 = xs.reduce((s, a) => s + a.roas3 * a.spend3, 0);
        const spendT = xs.reduce((s, a) => s + a.spendToday, 0);
        const purT = xs.reduce((s, a) => s + a.purToday, 0);
        return { spend3, roas3: spend3 > 0 ? val3 / spend3 : 0, spendT, purT };
      };

      const morningDone = (await getSetting("hanis_morning")) === todayMytH;
      for (const [id, info] of adsetBudget) {
        const budget = budgetById.get(id) ?? 0;
        if (budget <= 0) continue; // CBO
        const a = agg(id);
        const short = info.name.slice(0, 28);
        const isSg = /sg/i.test(info.name);

        // ── PAGI (sekali sehari) ──
        if (hourMytH === HANIS_MORNING_HOUR && !morningDone) {
          // (a) pulihkan potongan petang semalam jika 3-hari sihat
          const cut = parseJson<CutRec>(await getSetting(`hanis_cut_${id}`));
          if (cut && cut.date !== todayMytH) {
            if (a.roas3 > BREAKEVEN_META_ROAS && cut.from > budget) {
              const r = await setBudget(id, cut.from);
              if (r.ok) { budgetById.set(id, cut.from); totalBudget += cut.from - budget; touchedToday.add(id); }
              actions.push(`${dryrun ? "[DRY] " : ""}↩️ PULIH "${short}" RM${budget}→RM${cut.from} (potongan petang semalam; 3hr ROAS ${a.roas3.toFixed(2)}x sihat)`);
            }
            if (!dryrun) await setSetting(`hanis_cut_${id}`, "");
          }
          // (b) patah balik scale yg tak menjadi
          const rec = parseJson<ScaleRec>(await getSetting(`hanis_scale_${id}`));
          const ageH = rec ? (Date.now() - rec.at) / 3600_000 : 0;
          const y = yRoas.get(id);
          if (rec && ageH >= 20 && ageH <= 96 && y && y.spend >= 100 && y.roas < rec.roasBefore * HANIS_ROLLBACK_DROP && (budgetById.get(id) ?? 0) > rec.from) {
            const cur = budgetById.get(id) ?? budget;
            const r = await setBudget(id, rec.from);
            if (r.ok) { budgetById.set(id, rec.from); totalBudget += rec.from - cur; touchedToday.add(id); }
            if (!dryrun) await setSetting(`hanis_scale_${id}`, "");
            actions.push(`${dryrun ? "[DRY] " : ""}↩️ PATAH BALIK "${short}" RM${cur}→RM${rec.from} — lepas naik ROAS semalam ${y.roas.toFixed(2)}x < ${(rec.roasBefore * HANIS_ROLLBACK_DROP).toFixed(2)}x`);
            continue;
          }
          // (c) ROAS 3 hari ≤ breakeven → turun 20%
          const cur = budgetById.get(id) ?? budget;
          if (!touchedToday.has(id) && a.spend3 >= SPEND_PAUSE_3D && a.roas3 <= BREAKEVEN_META_ROAS && cur > HANIS_MIN_BUDGET) {
            const next = Math.max(HANIS_MIN_BUDGET, Math.round(cur * HANIS_MORNING_CUT));
            const r = await setBudget(id, next);
            if (r.ok) { budgetById.set(id, next); totalBudget += next - cur; touchedToday.add(id); }
            actions.push(`${dryrun ? "[DRY] " : ""}🌅 PAGI turun "${short}" RM${cur}→RM${next} — 3hr ROAS ${a.roas3.toFixed(2)}x ≤ breakeven ${BREAKEVEN_META_ROAS}x`);
          }
        }

        // ── PETANG: CPA hari ni terlalu tinggi → −25% hari tu (sekali sehari / adset) ──
        if (hourMytH >= HANIS_AFTERNOON_FROM && hourMytH <= HANIS_AFTERNOON_TO && !touchedToday.has(id)) {
          const cut = parseJson<CutRec>(await getSetting(`hanis_cut_${id}`));
          if (cut?.date === todayMytH) continue; // dah potong hari ni
          const limit = isSg ? CPP_BLEED_TODAY_SG : CPP_BLEED_TODAY;
          const cpp = a.purT > 0 ? a.spendT / a.purT : Infinity;
          if (a.spendT >= SPEND_BLEED_TODAY && cpp > limit) {
            const cur = budgetById.get(id) ?? budget;
            const next = Math.max(HANIS_MIN_BUDGET, Math.round(cur * HANIS_AFTERNOON_CUT));
            if (next < cur) {
              const r = await setBudget(id, next);
              if (r.ok) {
                budgetById.set(id, next); totalBudget += next - cur; touchedToday.add(id);
                if (!dryrun) await setSetting(`hanis_cut_${id}`, JSON.stringify({ from: cur, date: todayMytH } satisfies CutRec));
              }
              actions.push(`${dryrun ? "[DRY] " : ""}✂️ PETANG −25% "${short}" RM${cur}→RM${next} — CPA hari ni ${cpp === Infinity ? "tiada jualan" : "RM" + cpp.toFixed(0)} (had RM${limit}), belanja RM${a.spendT.toFixed(0)}`);
            }
          }
        }
      }
      if (hourMytH === HANIS_MORNING_HOUR && !morningDone && !dryrun) await setSetting("hanis_morning", todayMytH);
    }

    // ── B) SCALE adset winner (lama: +20% tiap larian · Hanis: +15% tunggu 72j) ──
    for (const [adsetId, info] of adsetBudget) {
      if (touchedToday.has(adsetId)) continue;
      if (mode === "hanis") {
        const rec = parseJson<ScaleRec>(await getSetting(`hanis_scale_${adsetId}`));
        if (rec && (Date.now() - rec.at) / 3600_000 < HANIS_SCALE_WAIT_H) continue; // tunggu 72 jam
        const cut = parseJson<CutRec>(await getSetting(`hanis_cut_${adsetId}`));
        if (cut?.date === todayMytH) continue; // kena potong hari ni → jangan naik
      }
      const adsetAds = ads.filter((a) => a.adsetId === adsetId);
      const spend3 = adsetAds.reduce((s, a) => s + a.spend3, 0);
      const val3 = adsetAds.reduce((s, a) => s + a.roas3 * a.spend3, 0);
      const roas3 = spend3 > 0 ? val3 / spend3 : 0;
      const pfs = pixelFactor(info.name);
      if (roas3 < ROAS_SCALE * pfs || spend3 < SPEND_SCALE_3D) continue;
      // Jangan scale kalau HARI NI tengah burn (catch-up lepas billing, atau tepu) — walau 3-hari nampak bagus.
      const todaySpend = adsetAds.reduce((s, a) => s + (todayMap.get(a.id)?.spend ?? 0), 0);
      const todayVal = adsetAds.reduce((s, a) => s + (todayMap.get(a.id)?.val ?? 0), 0);
      const todayRoas = todaySpend > 0 ? todayVal / todaySpend : 0;
      // Jangan scale bila data hari ni belum cukup (cth 2 pagi) — 24 Okt 02:06 scale ikut 3-hari je, MY RM1,500→1,800.
      if (todaySpend < SCALE_TODAY_SPEND_MIN) {
        actions.push(`⏭️ "${info.name.slice(0, 24)}" skip scale — belanja hari ni RM${todaySpend.toFixed(0)}, data belum cukup`);
        continue;
      }
      if (todayRoas < SCALE_TODAY_MIN * pfs) {
        actions.push(`⏭️ "${info.name.slice(0, 24)}" skip scale — hari ni ROAS ${todayRoas.toFixed(1)}x (burn)`);
        continue;
      }
      // Cap khas SG — market kecil/tepu, jangan over-scale walau ROAS nampak tinggi (lag attribution).
      const isSg = /sg/i.test(info.name);
      const adsetCap = ADSET_CAP[adsetId] ?? (isSg ? SG_ADSET_CAP : CAP_TOTAL);
      if (info.budget >= adsetCap) { actions.push(`🔒 "${info.name.slice(0, 24)}" dah cap RM${adsetCap}${isSg ? " (SG tepu)" : ""}`); continue; }
      const todayMytStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      if (isSg) {
        if (todayRoas < SCALE_TODAY_MIN * pfs * SG_SCALE_ROAS_MULT) {
          actions.push(`⏭️ "${info.name.slice(0, 24)}" SG skip — ROAS hari ni ${todayRoas.toFixed(1)}x belum cukup kuat`);
          continue;
        }
        if ((await getSetting("sg_last_scale")) === todayMytStr) {
          actions.push(`⏭️ "${info.name.slice(0, 24)}" SG dah naik sekali hari ni — tunggu esok`);
          continue;
        }
      }
      let next = Math.round(info.budget * (mode === "hanis" ? HANIS_SCALE_STEP : SCALE_STEP));
      if (next > adsetCap) next = adsetCap; // jangan lepas cap adset (khususnya SG)
      const headroom = CAP_TOTAL - (totalBudget - info.budget);
      if (next > headroom) next = Math.floor(headroom);
      if (next <= info.budget) { actions.push(`🔒 "${info.name.slice(0, 24)}" layak scale tapi cap penuh`); continue; }
      if (!dryrun) {
        const r = await gpost(adsetId, { daily_budget: String(next * 100) });
        if (!r.ok) { actions.push(`❌ scale gagal "${info.name.slice(0, 24)}": ${r.error}`); continue; }
      }
      if (isSg && !dryrun) await setSetting("sg_last_scale", todayMytStr);
      if (mode === "hanis" && !dryrun) {
        await setSetting(`hanis_scale_${adsetId}`, JSON.stringify({ from: info.budget, to: next, at: Date.now(), roasBefore: roas3 } satisfies ScaleRec));
      }
      totalBudget += next - info.budget;
      actions.push(`${dryrun ? "[DRY] " : ""}🚀 SCALE "${info.name.slice(0, 30)}" RM${info.budget}→RM${next} (ROAS ${roas3.toFixed(1)}x)`);
    }

    // ── B2) ALERT STRUKTUR (tutup lubang "owner sendiri perasan broad 1 video") ──
    const health: string[] = [];
    if (sgHealthAlert) health.push(sgHealthAlert);
    const broadActive = activePerAdset.get(MY_BROAD_ADSET) ?? 0;
    if (broadActive > 0 && broadActive < MIN_BROAD_WINNERS) {
      health.push(`⚠️ BROAD UTAMA cuma ${broadActive} video aktif (min ${MIN_BROAD_WINNERS}) — tambah winner dari bench, jangan bergantung creative penat!`);
    }
    if (idleWinners.length) {
      idleWinners.sort((a, b) => b.roas - a.roas);
      const top = idleWinners.slice(0, 5).map((w) => `${w.name.replace(/^FACELIM /, "").slice(0, 22)} ${w.roas.toFixed(1)}x/${w.pur}`).join(", ");
      health.push(`💡 ${idleWinners.length} winner terbukti TERPERUK (paused, boleh jalan): ${top}`);
    }

    // ── C) REPORT Telegram ──
    const totSpendToday = [...todayMap.values()].reduce((s, x) => s + x.spend, 0);
    const modeTag = mode === "hanis" ? " · Mod Hanis" : " · Mod lama";
    const head = (dryrun ? "🤖 AUTO-PROFIT (DRY-RUN — tiada tindakan sebenar)" : "🤖 AUTO-PROFIT") + modeTag;
    const lines = [
      head,
      `Belanja hari ni: RM${totSpendToday.toFixed(0)} · budget harian: RM${totalBudget.toFixed(0)}/${CAP_TOTAL}`,
      "",
      actions.length ? actions.join("\n") : "✅ Semua sihat — tiada pause/scale perlu.",
      ...(health.length ? ["", "— SEMAKAN STRUKTUR —", ...health] : []),
    ];
    // Dry-run ujian boleh senyap (&notify=0) supaya owner tak dapat spam Telegram
    if (!(dryrun && url.searchParams.get("notify") === "0")) await sendTelegram(lines.join("\n"));

    return NextResponse.json({
      ok: true,
      dryrun,
      mode,
      caps: { total: CAP_TOTAL, sg: SG_ADSET_CAP, adset: ADSET_CAP, todaySpendMin: SCALE_TODAY_SPEND_MIN, pixelFactor: { my: 0.5, sg: 0.5 } },
      health,
      totalBudget,
      spendToday: Math.round(totSpendToday),
      revived,
      actions,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
