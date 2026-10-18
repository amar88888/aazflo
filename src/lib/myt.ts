// Sempadan tarikh ikut waktu MALAYSIA (UTC+8) — TAK bergantung pada TZ server.
// Server prod jalan UTC; kalau guna date-fns startOfDay terus, "hari ni" tersasar 8 jam
// (order pagi 00:00-08:00 MYT masuk "semalam"). Guna helper ni di mana-mana kira tempoh.
const OFF = 8 * 3600 * 1000;

function shiftBack(m: Date): Date {
  return new Date(m.getTime() - OFF);
}

export function startOfDayMY(d: Date): Date {
  const m = new Date(d.getTime() + OFF);
  m.setUTCHours(0, 0, 0, 0);
  return shiftBack(m);
}
export function endOfDayMY(d: Date): Date {
  return new Date(startOfDayMY(d).getTime() + 86400000 - 1);
}
export function startOfMonthMY(d: Date): Date {
  const m = new Date(d.getTime() + OFF);
  m.setUTCDate(1);
  m.setUTCHours(0, 0, 0, 0);
  return shiftBack(m);
}
export function endOfMonthMY(d: Date): Date {
  const m = new Date(d.getTime() + OFF);
  m.setUTCMonth(m.getUTCMonth() + 1, 1);
  m.setUTCHours(0, 0, 0, 0);
  return new Date(shiftBack(m).getTime() - 1);
}
export function startOfYearMY(d: Date): Date {
  const m = new Date(d.getTime() + OFF);
  m.setUTCMonth(0, 1);
  m.setUTCHours(0, 0, 0, 0);
  return shiftBack(m);
}
export function endOfYearMY(d: Date): Date {
  const m = new Date(d.getTime() + OFF);
  m.setUTCFullYear(m.getUTCFullYear() + 1, 0, 1);
  m.setUTCHours(0, 0, 0, 0);
  return new Date(shiftBack(m).getTime() - 1);
}
// Label tarikh ikut MYT (cth "18/10") — shift dulu sebelum format.
export function toMytWall(d: Date): Date {
  return new Date(d.getTime() + OFF);
}
