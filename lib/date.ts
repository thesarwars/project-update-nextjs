const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Date -> "YYYY-MM-DD" using the *local* calendar day (never UTC). */
export function toISO(d: Date): string {
  const y = String(d.getFullYear()).padStart(4, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

/** "YYYY-MM-DD" -> local midnight Date. Avoids the UTC shift of `new Date(iso)`. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isValidISODate(iso: unknown): iso is string {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  // Round-tripping rejects impossible days like 2026-02-31.
  return toISO(parseISO(iso)) === iso;
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** "2026-09-08" -> "08-Sep-2026" */
export function formatDisplayDate(iso: string): string {
  const d = parseISO(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

export function weekdayName(iso: string): string {
  return WEEKDAYS[parseISO(iso).getDay()];
}

/** "Today" / "Yesterday" / "Tomorrow" / weekday name, for the date bar. */
export function relativeDayLabel(iso: string, today = todayISO()): string {
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  if (iso === addDays(today, 1)) return "Tomorrow";
  return weekdayName(iso);
}

export function isWeekend(iso: string): boolean {
  const day = parseISO(iso).getDay();
  return day === 0 || day === 6;
}

/** Previous working day: skips Sat/Sun so Monday looks back to Friday. */
export function previousWorkday(iso: string): string {
  let cur = addDays(iso, -1);
  let guard = 0;
  while (isWeekend(cur) && guard++ < 7) cur = addDays(cur, -1);
  return cur;
}
