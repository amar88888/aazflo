// Pengawal Order — imbas SEMUA kedai Woo & jerit di Telegram bila ada:
//   1. Order TERSANGKUT  — dah bayar/COD (processing/on-hold) tapi tiada AWB NinjaVan > 2 jam
//   2. Order BERGANDA    — telefon + jumlah sama, aktif, dalam 24 jam (termasuk merentas kedai)
//   3. Order SALAH KEDAI — pelanggan Malaysia (MYR / alamat MY) di kedai SG → NinjaVan SG tak boleh hantar
// Cuma lapor (tak auto-batal) — keputusan batal kekal pada manusia.

import { getWooStores, getNinjaTracking, type WooStore } from "@/lib/integrations/woocommerce";
import { DATA_START } from "@/lib/constants";

type GuardOrder = {
  id: number;
  status: string;
  total: string;
  currency: string;
  date_created_gmt: string;
  payment_method: string;
  billing: { first_name: string; last_name: string; phone: string; country: string };
  shipping: { country: string };
  meta_data?: { key: string; value: unknown }[];
};

export type GuardIssue = { kind: "sangkut" | "berganda" | "salah-kedai" | "telefon"; key: string; text: string };

// Status order yang akan / dah dihantar ke courier (bukan checkout terbengkalai).
const SHIPPING = new Set(["processing", "on-hold", "printed", "nv-pending-pickup"]);

const ACTIVE = new Set(["processing", "on-hold", "completed"]);
const STORE_LABELS: Record<string, string> = {
  facelim: "Facelim MY",
  facelimsg: "Facelim SG",
  maxlim: "Maxlim MY",
  maxlimsg: "Maxlim SG",
};

async function fetchRecent(store: WooStore, after: Date): Promise<GuardOrder[]> {
  const auth = Buffer.from(`${store.user}:${store.pass}`).toString("base64");
  const out: GuardOrder[] = [];
  for (let page = 1; page <= 5; page++) {
    const params = new URLSearchParams({
      per_page: "100",
      page: String(page),
      after: after.toISOString(),
      status: "any",
    });
    const res = await fetch(`${store.url}/wp-json/wc/v3/orders?${params}`, {
      headers: { Authorization: `Basic ${auth}`, "User-Agent": "Aazflo/1.0 (+https://aazflo.com)" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${store.key}: Woo ${res.status}`);
    const batch = (await res.json()) as GuardOrder[];
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

function normPhone(p: string): string {
  let d = (p || "").replace(/\D/g, "");
  if (d.startsWith("60")) d = d.slice(2);
  if (d.startsWith("65") && d.length === 10) d = d.slice(2);
  return d.replace(/^0+/, "");
}

function name(o: GuardOrder) {
  return `${o.billing.first_name} ${o.billing.last_name}`.trim() || "—";
}

export async function runOrderGuard(): Promise<{ issues: GuardIssue[]; errors: string[]; scanned: number }> {
  const now = Date.now();
  const since = new Date(Math.max(DATA_START.getTime(), now - 14 * 86400_000));
  const issues: GuardIssue[] = [];
  const errors: string[] = [];
  const all: { store: string; o: GuardOrder }[] = [];

  for (const store of await getWooStores()) {
    try {
      for (const o of await fetchRecent(store, since)) all.push({ store: store.key, o });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  for (const { store, o } of all) {
    const label = STORE_LABELS[store] ?? store;
    const ageH = (now - new Date(o.date_created_gmt + "Z").getTime()) / 3600_000;

    // 1. Tersangkut: processing/on-hold tanpa AWB lebih 2 jam
    if ((o.status === "processing" || o.status === "on-hold") && ageH > 2 && !getNinjaTracking(o as never)) {
      issues.push({
        kind: "sangkut",
        key: `s:${store}:${o.id}`,
        text: `${label} #${o.id} ${name(o)} — ${o.status}, tiada AWB ${ageH < 48 ? Math.round(ageH) + " jam" : Math.round(ageH / 24) + " hari"}`,
      });
    }

    // 4. Telefon tak sah: order nak hantar tapi telefon < 8 digit (cth "11") —
    //    NinjaVan tak boleh call untuk COD → hampir pasti gagal hantar / RTO.
    const digits = normPhone(o.billing.phone);
    if (SHIPPING.has(o.status) && digits.length < 8) {
      issues.push({
        kind: "telefon",
        key: `t:${store}:${o.id}`,
        text: `${label} #${o.id} ${name(o)} — telefon TAK SAH "${o.billing.phone || "(kosong)"}" (${digits.length} digit); COD tak boleh hantar`,
      });
    }

    // 3. Salah kedai: order MY di kedai SG
    const isSgStore = /sg/i.test(store);
    const looksMy = o.currency === "MYR" || o.shipping?.country === "MY" || o.billing?.country === "MY";
    if (isSgStore && looksMy && o.status !== "cancelled" && o.status !== "trash" && o.status !== "failed") {
      issues.push({
        kind: "salah-kedai",
        key: `k:${store}:${o.id}`,
        text: `${label} #${o.id} ${name(o)} — pelanggan MALAYSIA di kedai SG (${o.currency}); pindah ke kedai MY`,
      });
    }
  }

  // 2. Berganda: pelanggan sama (KEDAI + telefon) buat 2 order rapat masa — tersilap klik / beli dua kali.
  //    DUA corak ditangkap:
  //      • Jumlah SAMA, jarak ≤ 6 jam  → keyakinan tinggi (benar-benar berganda)
  //      • Jumlah/produk LAIN, jarak ≤ 30 min → kemungkinan berganda (cth 2 botol & 3 botol seminit beza) — sahkan dulu
  //    (Beli silang-jenama Facelim+Maxlim, atau order berasingan berjam/hari, BUKAN berganda.)
  // Hanya order yg akan DIHANTAR (dah bayar / COD disahkan). Checkout terbengkalai (unpaid/pending) bukan berganda.
  const CANCELLABLE = new Set(["processing", "on-hold", "printed", "nv-pending-pickup"]);
  const live = all.filter(({ o }) => CANCELLABLE.has(o.status));
  // Kumpul ikut KEDAI + TELEFON sahaja (tak kira jumlah) supaya order produk lain pun tertangkap.
  const groups = new Map<string, { store: string; o: GuardOrder }[]>();
  for (const x of live) {
    const ph = normPhone(x.o.billing.phone);
    if (!ph) continue;
    const k = `${x.store}|${ph}`;
    groups.set(k, [...(groups.get(k) ?? []), x]);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.o.date_created_gmt.localeCompare(b.o.date_created_gmt));
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      const gapMin = (new Date(b.o.date_created_gmt + "Z").getTime() - new Date(a.o.date_created_gmt + "Z").getTime()) / 60_000;
      const sameTotal = Number(a.o.total) === Number(b.o.total);
      // Sama jumlah: tetingkap 6 jam. Jumlah/produk lain: tetingkap 30 minit (lebih ketat, elak false positive).
      if (!(sameTotal ? gapMin <= 360 : gapMin <= 30)) continue;
      const gapTxt = gapMin < 60 ? `${Math.round(gapMin)} min` : `${(gapMin / 60).toFixed(1)} jam`;
      const note = sameTotal ? "" : " ⚠️ produk/jumlah LAIN — sahkan dgn pelanggan dulu";
      issues.push({
        kind: "berganda",
        key: `d:${a.store}:${a.o.id}:${b.store}:${b.o.id}`,
        text: `${name(b.o)} — ${STORE_LABELS[a.store] ?? a.store} #${a.o.id} (${a.o.total}) & #${b.o.id} (${b.o.total}), jarak ${gapTxt}${note}`,
      });
    }
  }

  return { issues, errors, scanned: all.length };
}

export function formatGuard(issues: GuardIssue[], errors: string[]): string {
  const L: string[] = ["<b>🛡️ Pengawal Order Aazflo</b>"];
  const sec = (kind: GuardIssue["kind"], title: string, hint: string) => {
    const xs = issues.filter((i) => i.kind === kind);
    if (!xs.length) return;
    L.push("", `<b>${title} (${xs.length})</b>`);
    for (const x of xs.slice(0, 15)) L.push(`• ${x.text.replace(/</g, "&lt;")}`);
    if (xs.length > 15) L.push(`• …dan ${xs.length - 15} lagi`);
    L.push(`<i>${hint}</i>`);
  };
  sec("telefon", "📵 Telefon TAK SAH — COD tak boleh hantar", "Dapatkan telefon betul dari pelanggan; kalau tak dapat, batal AWB sebelum pickup (elak RTO)");
  sec("sangkut", "⏳ Order tersangkut — belum push NinjaVan", "Push di WooCommerce → Orders → Push to Ninja Van");
  sec("berganda", "👯 Kemungkinan order berganda", "Sahkan dgn pelanggan (WhatsApp) dulu; kalau silap, batal yang lebih + batal AWB NinjaVan sebelum pickup");
  sec("salah-kedai", "🌏 Pelanggan Malaysia di kedai SG", "NinjaVan SG tak boleh hantar — cipta semula di kedai MY, batal yang SG");
  if (errors.length) L.push("", `⚠️ Gagal baca: ${errors.join("; ").replace(/</g, "&lt;")}`);
  return L.join("\n");
}
