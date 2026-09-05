import Papa from "papaparse";
import type { Platform } from "@/lib/constants";

// Export CSV Shopee/TikTok berbeza header ikut locale & versi seller center,
// jadi parser guna senarai alias — cari header pertama yang match.
type FieldAliases = {
  orderId: string[];
  status: string[];
  buyerName: string[];
  productName: string[];
  sku: string[];
  quantity: string[];
  unitPrice: string[];
  orderTotal: string[];
  orderedAt: string[];
};

const ALIASES: Record<Exclude<Platform, "woocommerce">, FieldAliases> = {
  tiktok: {
    orderId: ["Order ID", "order id"],
    status: ["Order Status", "Order Substatus"],
    buyerName: ["Buyer Username", "Recipient", "Buyer"],
    productName: ["Product Name"],
    sku: ["Seller SKU", "SKU ID"],
    quantity: ["Quantity"],
    unitPrice: ["SKU Subtotal After Discount", "SKU Unit Original Price", "SKU Subtotal Before Discount"],
    orderTotal: ["Order Amount", "Total Amount"],
    orderedAt: ["Created Time", "Order Created Time", "Created At"],
  },
  shopee: {
    orderId: ["Order ID", "No. Pesanan", "Order SN"],
    status: ["Order Status", "Status Pesanan"],
    buyerName: ["Username (Buyer)", "Receiver Name", "Nama Penerima", "Buyer Username"],
    productName: ["Product Name", "Nama Produk"],
    sku: ["SKU Reference No.", "Parent SKU Reference No.", "SKU Induk", "No. Referensi SKU"],
    quantity: ["Quantity", "Jumlah"],
    unitPrice: ["Deal Price", "Harga Setelah Diskon", "Original Price", "Harga Awal"],
    orderTotal: ["Order Total Amount", "Total Payment", "Total Pembayaran", "Grand Total"],
    orderedAt: ["Order Creation Date", "Waktu Pesanan Dibuat", "Order Time", "Order Paid Time"],
  },
};

export type ParsedOrder = {
  platformOrderId: string;
  status: string;
  buyerName: string | null;
  total: number;
  orderedAt: Date;
  items: { sku: string | null; name: string; quantity: number; unitPrice: number }[];
};

export type ParseResult = {
  orders: ParsedOrder[];
  errors: string[];
  skippedRows: number;
};

function pick(row: Record<string, string>, aliases: string[]): string | null {
  for (const key of Object.keys(row)) {
    if (aliases.some((a) => key.trim().toLowerCase() === a.toLowerCase())) {
      const v = row[key]?.trim();
      if (v) return v;
    }
  }
  return null;
}

function toNumber(v: string | null): number {
  if (!v) return 0;
  // Buang simbol mata wang & pemisah ribu (RM1,234.50 / 1.234,50)
  const cleaned = v.replace(/[^\d.,-]/g, "");
  if (/,\d{2}$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return parseFloat(cleaned.replace(/,/g, "")) || 0;
}

function toDate(v: string | null): Date | null {
  if (!v) return null;
  // Format dd/mm/yyyy hh:mm DULU — new Date() akan salah baca sebagai mm/dd (US)
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    return new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  }
  const direct = new Date(v);
  if (!isNaN(direct.getTime())) return direct;
  return null;
}

function mapStatus(raw: string): string {
  const s = raw.toLowerCase();
  if (/(cancel|batal)/.test(s)) return "cancelled";
  if (/(complete|selesai|delivered|diterima)/.test(s)) return "completed";
  // "To ship" / "Perlu Dikirim" = BELUM hantar → pending (check sebelum corak "ship")
  if (/(to ship|to_ship|awaiting|perlu dikirim|belum)/.test(s)) return "pending";
  if (/(ship|hantar|transit|to receive|dikirim)/.test(s)) return "shipped";
  return "pending";
}

export function parseOrderCsv(csvText: string, platform: "tiktok" | "shopee"): ParseResult {
  const aliases = ALIASES[platform];
  const errors: string[] = [];
  let skippedRows = 0;

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.data.length === 0) {
    return { orders: [], errors: ["Fail CSV kosong atau format tidak dikenali."], skippedRows: 0 };
  }

  const sampleRow = parsed.data[0];
  if (!pick(sampleRow, aliases.orderId)) {
    return {
      orders: [],
      errors: [
        `Kolum Order ID tak jumpa. Header dijumpai: ${Object.keys(sampleRow).slice(0, 10).join(", ")}...`,
        `Pastikan ni export order dari ${platform === "tiktok" ? "TikTok Seller Center" : "Shopee Seller Centre"}.`,
      ],
      skippedRows: 0,
    };
  }

  // Satu order boleh ada banyak row (satu row per item) — group ikut order ID
  const orderMap = new Map<string, ParsedOrder>();
  for (const row of parsed.data) {
    const orderId = pick(row, aliases.orderId);
    if (!orderId) {
      skippedRows++;
      continue;
    }
    const orderedAt = toDate(pick(row, aliases.orderedAt));
    if (!orderedAt) {
      skippedRows++;
      continue;
    }

    let order = orderMap.get(orderId);
    if (!order) {
      order = {
        platformOrderId: orderId,
        status: mapStatus(pick(row, aliases.status) ?? ""),
        buyerName: pick(row, aliases.buyerName),
        total: toNumber(pick(row, aliases.orderTotal)),
        orderedAt,
        items: [],
      };
      orderMap.set(orderId, order);
    }

    const name = pick(row, aliases.productName);
    if (name) {
      order.items.push({
        sku: pick(row, aliases.sku),
        name,
        quantity: Math.max(1, Math.round(toNumber(pick(row, aliases.quantity)) || 1)),
        unitPrice: toNumber(pick(row, aliases.unitPrice)),
      });
    }
  }

  return { orders: Array.from(orderMap.values()), errors, skippedRows };
}
