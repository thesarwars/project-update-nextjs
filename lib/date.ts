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

export const DURATION_UNITS = ["days", "weeks", "months", "years"] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

/**
 * The last day of a sprint, inclusive.
 *
 * Stored as unit + count rather than a second date so "next sprint, same length" stays
 * one click and the two can never disagree. Month and year arithmetic clamps rather than
 * overflowing: a sprint starting 31 January and running one month ends 28 February, not
 * 3 March.
 */
export function endOfSprint(startISO: string, unit: DurationUnit, count: number): string {
  const start = parseISO(startISO);
  const n = Math.max(1, Math.floor(count));

  if (unit === "days") return addDays(startISO, n - 1);
  if (unit === "weeks") return addDays(startISO, n * 7 - 1);

  const months = unit === "months" ? n : n * 12;
  const target = new Date(start.getFullYear(), start.getMonth() + months, 1);
  const lastDayOfTarget = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(start.getDate(), lastDayOfTarget));
  // Inclusive: a one-month sprint from the 1st ends on the last day of that month.
  target.setDate(target.getDate() - 1);
  return toISO(target);
}

/** Working days in a range, inclusive, skipping weekends. */
export function workingDaysBetween(startISO: string, endISO: string): number {
  let count = 0;
  let cursor = startISO;
  let guard = 0;
  while (cursor <= endISO && guard++ < 4000) {
    if (!isWeekend(cursor)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

/** Whole days from today until the end, or null once it has passed. */
export function daysLeft(endISO: string, today = todayISO()): number | null {
  if (endISO < today) return null;
  let count = 0;
  let cursor = today;
  while (cursor < endISO && count < 4000) {
    cursor = addDays(cursor, 1);
    count += 1;
  }
  return count;
}
