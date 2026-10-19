export function formatRM(amount: number): string {
  return new Intl.NumberFormat("ms-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(amount);
}

// Server jalan UTC (process.env.TZ tak diset). Paksa papar waktu Malaysia,
// kalau tak masa order masuk nampak lambat 8 jam (order malam jadi petang).
const MY_TZ = "Asia/Kuala_Lumpur";

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("ms-MY", {
    timeZone: MY_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("ms-MY", {
    timeZone: MY_TZ,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
