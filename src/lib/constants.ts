export const PLATFORMS = ["tiktok", "shopee", "woocommerce"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok Shop",
  shopee: "Shopee",
  woocommerce: "Website",
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  tiktok: "#06b6d4",
  shopee: "#f97316",
  woocommerce: "#8b5cf6",
};

export const ORDER_STATUSES = ["pending", "printed", "shipped", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Belum print AWB",
  printed: "AWB printed",
  shipped: "Dihantar",
  completed: "Selesai",
  cancelled: "Batal",
};

export const EXPENSE_TYPES = ["ads", "fixed", "other"] as const;
export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  ads: "Iklan (Ads)",
  fixed: "Kos Tetap",
  other: "Lain-lain",
};

// Courier popular di Malaysia
export const COURIERS = [
  "J&T Express",
  "SPX Express",
  "Pos Laju",
  "Ninja Van",
  "Flash Express",
  "City-Link",
  "DHL eCommerce",
  "Best Express",
] as const;

export const DELIVERY_STATUSES = [
  "pending",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed",
  "returned",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "Belum pickup",
  in_transit: "Dalam transit",
  out_for_delivery: "Sedang dihantar",
  delivered: "Sampai",
  failed: "Gagal hantar",
  returned: "Dipulangkan",
};

export const DELIVERY_STATUS_COLORS: Record<DeliveryStatus, string> = {
  pending: "slate",
  in_transit: "blue",
  out_for_delivery: "purple",
  delivered: "green",
  failed: "red",
  returned: "orange",
};

export const RETURN_STATUSES = ["none", "requested", "approved", "returned", "refunded"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  none: "—",
  requested: "Mohon return",
  approved: "Return diluluskan",
  returned: "Barang dipulangkan",
  refunded: "Refund selesai",
};

export const RETURN_STATUS_COLORS: Record<ReturnStatus, string> = {
  none: "slate",
  requested: "orange",
  approved: "blue",
  returned: "purple",
  refunded: "red",
};

// ── Operasi Office: petty cash ──
export const CASH_TYPES = ["topup", "expense", "claim"] as const;
export type CashType = (typeof CASH_TYPES)[number];

export const CASH_TYPE_LABELS: Record<CashType, string> = {
  topup: "Top-up (duit masuk)",
  expense: "Perbelanjaan",
  claim: "Claim staff",
};

export const CASH_CATEGORIES = ["lalamove", "supplies", "wage", "other"] as const;
export type CashCategory = (typeof CASH_CATEGORIES)[number];

export const CASH_CATEGORY_LABELS: Record<CashCategory, string> = {
  lalamove: "Lalamove",
  supplies: "Beli barang",
  wage: "Gaji part-time",
  other: "Lain-lain",
};
