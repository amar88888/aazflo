import { db } from "@/lib/db";
import { DATA_START } from "@/lib/constants";

// ── Cashflow / Hunt COD ──
// Jejak duit sebenar merentas semua kedai guna deliveryStatus + status order:
//   MASUK   = parcel delivered / order completed (duit COD dikutip atau prepaid selesai)
//   TRANSIT = masih dalam perjalanan / belum pickup (COD belum kutip)
//   LOST    = batal / returned / refunded (RTO)
// Tiada perlu field COD berasingan — delivered bermakna duit secured tanpa kira COD/prepaid.

export type CashBucket = {
  masuk: number;
  masukN: number;
  transit: number;
  transitN: number;
  lost: number;
  lostN: number;
};

export type StoreCashflow = CashBucket & {
  store: string;
  currency: "RM" | "SGD";
  total: number; // masuk + transit (belum termasuk lost)
  collectRate: number; // % masuk daripada (masuk+transit+lost)
};

function blank(): CashBucket {
  return { masuk: 0, masukN: 0, transit: 0, transitN: 0, lost: 0, lostN: 0 };
}

function currencyFor(store: string): "RM" | "SGD" {
  return /sg/i.test(store) ? "SGD" : "RM";
}

export async function getCashflowData(from: Date, to: Date): Promise<StoreCashflow[]> {
  // Jangan kira order sebelum kita start ads — data lama diabaikan.
  const floor = from < DATA_START ? DATA_START : from;
  const orders = await db.order.findMany({
    where: { orderedAt: { gte: floor, lte: to } },
    select: { store: true, total: true, status: true, deliveryStatus: true, returnStatus: true },
  });

  const byStore = new Map<string, CashBucket>();
  const add = (store: string, status: string, delivery: string, ret: string, total: number) => {
    if (!byStore.has(store)) byStore.set(store, blank());
    const b = byStore.get(store)!;

    const isLost =
      status === "cancelled" ||
      ret === "returned" ||
      ret === "refunded" ||
      delivery === "returned" ||
      delivery === "failed";
    const isMasuk = delivery === "delivered" || status === "completed";

    if (isLost) {
      b.lost += total;
      b.lostN++;
    } else if (isMasuk) {
      b.masuk += total;
      b.masukN++;
    } else {
      b.transit += total;
      b.transitN++;
    }
  };

  for (const o of orders) {
    add(o.store, o.status, o.deliveryStatus, o.returnStatus, o.total);
  }

  const out: StoreCashflow[] = [];
  for (const [store, b] of byStore) {
    const denom = b.masuk + b.transit + b.lost;
    out.push({
      store,
      currency: currencyFor(store),
      ...b,
      total: b.masuk + b.transit,
      collectRate: denom > 0 ? (b.masuk / denom) * 100 : 0,
    });
  }
  // kedai dengan jualan terbesar dulu
  out.sort((a, b) => b.masuk + b.transit - (a.masuk + a.transit));
  return out;
}
