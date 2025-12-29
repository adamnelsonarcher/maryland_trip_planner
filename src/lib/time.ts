export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function formatDateISO(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseDateISO(dateISO: string) {
  // dateISO: "YYYY-MM-DD" (treated as local date)
  const [y, m, d] = dateISO.split("-").map((x) => Number(x));
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function addDays(dateISO: string, days: number) {
  const dt = parseDateISO(dateISO);
  dt.setDate(dt.getDate() + days);
  return formatDateISO(dt);
}

export function diffDaysInclusive(startISO: string, endISO: string) {
  const s = parseDateISO(startISO).getTime();
  const e = parseDateISO(endISO).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((e - s) / dayMs) + 1);
}

export function makeLocalDateTime(dateISO: string, timeHHMM: string) {
  const [hh, mm] = timeHHMM.split(":").map((x) => Number(x));
  const d = parseDateISO(dateISO);
  d.setHours(hh, mm, 0, 0);
  return d;
}

export function formatTimeShort(d: Date) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDateShort(dateISO: string) {
  const d = parseDateISO(dateISO);
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}


