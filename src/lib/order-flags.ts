// Tanda auto pada senarai order (dashboard + Orders & AWB) — supaya Amar/staff tak perlu semak sendiri:
//   • "Double?"        — pelanggan SAMA (telefon) order jenama SAMA 2 kali dalam 24 jam → sahkan dulu
//   • "Pelanggan sama" — telefon sama, jenama LAIN (cth Facelim SG + Maxlim SG) → BUKAN double, 2 produk
//   • "AWB gagal"      — plugin NinjaVan gagal push (cth token mati) → order takkan dapat AWB sendiri
// Fungsi tulen (tiada DB) — selamat diguna di server component mana-mana.

export function normPhone(p: string | null | undefined): string {
  let d = (p || "").replace(/\D/g, "");
  if (d.startsWith("60")) d = d.slice(2);
  if (d.startsWith("65") && d.length === 10) d = d.slice(2);
  return d.replace(/^0+/, "");
}

export const STORE_SHORT: Record<string, string> = {
  facelim: "Facelim MY",
  facelimsg: "Facelim SG",
  maxlim: "Maxlim MY",
  maxlimsg: "Maxlim SG",
};

function brandOf(store: string): string {
  if (/^facelim/i.test(store)) return "FACELIM";
  if (/^maxlim/i.test(store)) return "MAXLIM";
  return store;
}

export type FlagInput = {
  id: string;
  store: string;
  platformOrderId: string;
  buyerPhone: string | null;
  status: string;
  orderedAt: Date | string;
  awbError?: string | null;
  trackingNo?: string | null;
};

export type OrderFlag = { color: "red" | "purple" | "orange"; text: string; title: string };

const WINDOW_MS = 24 * 3600_000;

// `targets` = order yang nak dipapar; `pool` = order rujukan (cth 3 hari terakhir) untuk cari pasangan.
export function orderFlags(targets: FlagInput[], pool: FlagInput[]): Map<string, OrderFlag[]> {
  const out = new Map<string, OrderFlag[]>();
  const byPhone = new Map<string, FlagInput[]>();
  for (const o of pool) {
    if (o.status === "cancelled") continue;
    const ph = normPhone(o.buyerPhone);
    if (ph.length < 7) continue;
    byPhone.set(ph, [...(byPhone.get(ph) ?? []), o]);
  }
  for (const o of targets) {
    const flags: OrderFlag[] = [];
    if (o.awbError && !o.trackingNo && o.status === "pending") {
      flags.push({ color: "red", text: "AWB gagal", title: `NinjaVan: ${o.awbError}` });
    }
    const ph = normPhone(o.buyerPhone);
    if (o.status !== "cancelled" && ph.length >= 7) {
      const t = new Date(o.orderedAt).getTime();
      const mates = (byPhone.get(ph) ?? []).filter(
        (x) => x.id !== o.id && Math.abs(new Date(x.orderedAt).getTime() - t) <= WINDOW_MS,
      );
      for (const m of mates) {
        const same = brandOf(m.store) === brandOf(o.store);
        flags.push(
          same
            ? { color: "orange", text: `Double? #${m.platformOrderId}`, title: "Telefon & jenama sama dalam 24 jam — sahkan dgn pelanggan sebelum pickup" }
            : {
                color: "purple",
                text: `+ ${STORE_SHORT[m.store] ?? m.store} #${m.platformOrderId}`,
                title: "Pelanggan sama beli produk lain — BUKAN double",
              },
        );
      }
    }
    if (flags.length) out.set(o.id, flags);
  }
  return out;
}
