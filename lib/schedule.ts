import { addDays, parseISO } from "./date";
import { DEFAULT_HOURS_PER_DAY, DEFAULT_WORKING_DAYS, type Issue, type Project } from "./types";

/**
 * Effort, and where that effort lands on a calendar.
 *
 * Deliberately free of `server-only` and of the database: the same functions run in a
 * server component, in a client component typing into the estimate box, and under
 * `node --test`, which is what keeps the number in the backlog and the number in the
 * detail pane from drifting apart.
 *
 * Everything here is a projection computed on read. Nothing writes a derived date back
 * to a row, so changing one estimate — or the length of the working day — re-plans the
 * whole project on the next render rather than leaving stale dates behind.
 */

export interface WorkCalendar {
  /** Hours in a working day. */
  hoursPerDay: number;
  /** Weekday numbers that are worked, 0 = Sunday. Never empty. */
  workingDays: number[];
}

/** Below half an hour a "day" stops meaning anything; above 24 it is not a day at all. */
const MIN_HOURS_PER_DAY = 0.5;
const MAX_HOURS_PER_DAY = 24;

/** A single estimate past this is a typo, and walking it day by day would hang. */
export const MAX_ESTIMATE_HOURS = 100_000;

/** Float dust: estimates are REAL, so 0.1 + 0.2 must not leave a sliver of work behind. */
const EPSILON = 1e-6;

/** Backstop for the day-advancing loops. Never reached by an estimate in range. */
const MAX_STEPS = 20_000;

export function clampHoursPerDay(hours: number): number {
  if (!Number.isFinite(hours)) return DEFAULT_HOURS_PER_DAY;
  return Math.min(MAX_HOURS_PER_DAY, Math.max(MIN_HOURS_PER_DAY, hours));
}

/** Whole, in range, deduplicated, ordered — and never empty, or the week has no end. */
export function cleanWorkingDays(days: readonly number[] | undefined): number[] {
  const clean = [...new Set((days ?? []).map(Math.trunc))]
    .filter((d) => d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  return clean.length ? clean : [...DEFAULT_WORKING_DAYS];
}

/** A calendar nothing downstream has to re-validate. */
export function toCalendar(input: Partial<WorkCalendar> | undefined): WorkCalendar {
  return {
    hoursPerDay: clampHoursPerDay(input?.hoursPerDay ?? DEFAULT_HOURS_PER_DAY),
    workingDays: cleanWorkingDays(input?.workingDays),
  };
}

export function calendarOf(project: Pick<Project, "hoursPerDay" | "workingDays">): WorkCalendar {
  return toCalendar(project);
}

function isWorkday(iso: string, calendar: WorkCalendar): boolean {
  return calendar.workingDays.includes(parseISO(iso).getDay());
}

/** `iso` itself when it is worked, otherwise the next day that is. */
export function firstWorkday(iso: string, calendar: WorkCalendar): string {
  let cursor = iso;
  // At most seven steps: cleanWorkingDays guarantees at least one worked weekday.
  for (let i = 0; i < 7 && !isWorkday(cursor, calendar); i += 1) cursor = addDays(cursor, 1);
  return cursor;
}

export function nextWorkday(iso: string, calendar: WorkCalendar): string {
  return firstWorkday(addDays(iso, 1), calendar);
}

/** Worked days in a range, inclusive. The calendar-aware `workingDaysBetween`. */
export function workdaysBetween(startISO: string, endISO: string, calendar: WorkCalendar): number {
  let count = 0;
  let cursor = startISO;
  for (let i = 0; cursor <= endISO && i < MAX_STEPS; i += 1) {
    if (isWorkday(cursor, calendar)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

/* ------------------------------------------------------------------ *
 * Durations as text
 * ------------------------------------------------------------------ */

/** `4`, `4h`, `2d`, `1d 4h`, `1.5h`, `2 days` — a number followed by an optional unit. */
const AMOUNT = /(\d+(?:\.\d+)?)\s*([a-z]*)/gi;

const UNIT_HOURS = new Set(["", "h", "hr", "hrs", "hour", "hours"]);
const UNIT_DAYS = new Set(["d", "day", "days"]);

/** Trailing zeros are noise: 2 rather than 2.00, 1.5 rather than 1.50. */
const trim = (n: number): string => String(Number(n.toFixed(2)));

/**
 * Typed text -> hours, or null when it is not a duration at all.
 *
 * Every character has to be accounted for, so `1d x` is refused rather than silently
 * read as one day: an estimate that quietly loses half of what was typed is worse than
 * one that refuses to save.
 */
export function parseDuration(text: string, calendar: WorkCalendar): number | null {
  const input = text.trim().toLowerCase();
  if (!input) return null;

  let hours = 0;
  let canonical = "";
  for (const [whole, amount, unit] of input.matchAll(AMOUNT)) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return null;
    if (UNIT_HOURS.has(unit)) hours += value;
    else if (UNIT_DAYS.has(unit)) hours += value * calendar.hoursPerDay;
    else return null;
    canonical += whole.replace(/\s+/g, "");
  }

  // Nothing matched, or something outside the matches was typed.
  if (!canonical || canonical !== input.replace(/\s+/g, "")) return null;
  if (hours > MAX_ESTIMATE_HOURS) return null;
  return Number(hours.toFixed(2));
}

/** Hours -> `2d`, `2d 4h`, `4h`. The inverse of `parseDuration` for values it produces. */
export function formatDuration(hours: number, calendar: WorkCalendar): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0h";
  const days = Math.floor(hours / calendar.hoursPerDay + EPSILON);
  const rest = Number((hours - days * calendar.hoursPerDay).toFixed(2));
  if (days && rest > EPSILON) return `${trim(days)}d ${trim(rest)}h`;
  if (days) return `${trim(days)}d`;
  return `${trim(rest)}h`;
}

/* ------------------------------------------------------------------ *
 * The schedule
 * ------------------------------------------------------------------ */

export interface ScheduleEntry {
  issueId: string;
  /** Own estimate for a leaf; the sum of every descendant leaf for a parent. */
  hours: number;
  /** True when `hours` came from children rather than the issue's own field. */
  rolledUp: boolean;
  /** Descendant leaves with no estimate — why a rolled-up total may be understated. */
  unestimated: number;
  /** First worked day, inclusive. Null when nothing under the issue is estimated. */
  start: string | null;
  /** Last worked day, inclusive. */
  end: string | null;
  /** The projection finishes after the issue's own due date. */
  late: boolean;
}

export interface ScheduleOptions {
  calendar: WorkCalendar;
  /** Day the queue opens. Callers pass `project.scheduleStart ?? todayISO()`. */
  startDate: string;
}

export type Schedule = Record<string, ScheduleEntry>;

/** Same ordering as `orderDepthFirst`: siblings by rank, ties broken by id. */
const byRank = (a: Issue, b: Issue): number =>
  a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id < b.id ? -1 : 1;

const estimateHours = (issue: Issue): number => {
  const raw = issue.estimate ?? 0;
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(raw, MAX_ESTIMATE_HOURS);
};

/**
 * Lay every issue out on the calendar, in one pass.
 *
 * One queue in backlog order: a leaf starts when the leaf before it finished, and a
 * parent simply spans its children. There is no capacity model and no dependency graph —
 * four 4h subtasks take two 8-hour days because they are done one after another, which is
 * the arithmetic people already do in their heads.
 *
 * A `startDate` on an issue pins its branch: the cursor jumps forward to it, never back,
 * so a pin can push work out but can never make two issues overlap.
 */
export function buildSchedule(issues: Issue[], { calendar, startDate }: ScheduleOptions): Schedule {
  const byParent = new Map<string | null, Issue[]>();
  const present = new Set(issues.map((i) => i.id));
  for (const issue of issues) {
    // A row whose parent was filtered out is a root here, exactly as in orderDepthFirst.
    const parent = issue.parentId && present.has(issue.parentId) ? issue.parentId : null;
    const siblings = byParent.get(parent) ?? [];
    siblings.push(issue);
    byParent.set(parent, siblings);
  }
  for (const siblings of byParent.values()) siblings.sort(byRank);

  const schedule: Schedule = {};
  let cursor = firstWorkday(startDate, calendar);
  /** Hours already spent on `cursor`, so half-days pack instead of rounding up. */
  let spent = 0;

  /** Take `hours` off the queue, and report which days it touched. */
  const consume = (hours: number): { start: string; end: string } => {
    const start = cursor;
    let end = cursor;
    let left = hours;
    for (let step = 0; left > EPSILON && step < MAX_STEPS; step += 1) {
      const available = calendar.hoursPerDay - spent;
      const take = Math.min(left, available);
      left -= take;
      spent += take;
      end = cursor;
      if (spent >= calendar.hoursPerDay - EPSILON) {
        cursor = nextWorkday(cursor, calendar);
        spent = 0;
      }
    }
    return { start, end };
  };

  const visit = (issue: Issue): ScheduleEntry => {
    if (issue.startDate) {
      const pinned = firstWorkday(issue.startDate, calendar);
      if (pinned > cursor) {
        cursor = pinned;
        spent = 0;
      }
    }

    const children = byParent.get(issue.id) ?? [];
    let entry: ScheduleEntry;

    if (!children.length) {
      const hours = estimateHours(issue);
      const span = hours > 0 ? consume(hours) : null;
      entry = {
        issueId: issue.id,
        hours,
        rolledUp: false,
        // An unestimated leaf takes no time at all rather than a guessed default: a
        // total that is visibly short is arguable, an invented one is not.
        unestimated: hours > 0 ? 0 : 1,
        start: span?.start ?? null,
        end: span?.end ?? null,
        late: false,
      };
    } else {
      let hours = 0;
      let unestimated = 0;
      let start: string | null = null;
      let end: string | null = null;
      for (const child of children) {
        const kid = visit(child);
        hours += kid.hours;
        unestimated += kid.unestimated;
        if (kid.start && (!start || kid.start < start)) start = kid.start;
        if (kid.end && (!end || kid.end > end)) end = kid.end;
      }
      entry = {
        issueId: issue.id,
        hours: Number(hours.toFixed(2)),
        rolledUp: true,
        unestimated,
        start,
        end,
        late: false,
      };
    }

    entry.late = Boolean(issue.dueDate && entry.end && entry.end > issue.dueDate);
    schedule[issue.id] = entry;
    return entry;
  };

  for (const root of byParent.get(null) ?? []) visit(root);
  return schedule;
}

/** What a row or a card shows: the rolled-up effort, and whether it misses its date. */
export interface TimeBadge {
  label: string;
  late: boolean;
}

export function timeBadge(
  entry: ScheduleEntry | undefined,
  calendar: WorkCalendar,
): TimeBadge | undefined {
  if (!entry || entry.hours <= 0) return undefined;
  return { label: formatDuration(entry.hours, calendar), late: entry.late };
}

/** Badges for a whole schedule. Issues with nothing estimated under them are left out. */
export function badgesFor(
  schedule: Schedule,
  calendar: WorkCalendar,
): Record<string, TimeBadge> {
  const badges: Record<string, TimeBadge> = {};
  for (const [id, entry] of Object.entries(schedule)) {
    const badge = timeBadge(entry, calendar);
    if (badge) badges[id] = badge;
  }
  return badges;
}

/**
 * What a list view needs, in one call: the calendar, the projection, and the badges.
 *
 * `today` is passed in rather than read here — see `relativeDayLabel` in lib/date.ts for
 * why every clock read in this codebase is an argument.
 */
export function planProject(
  project: Pick<Project, "hoursPerDay" | "workingDays" | "scheduleStart">,
  issues: Issue[],
  today: string,
): { calendar: WorkCalendar; schedule: Schedule; times: Record<string, TimeBadge> } {
  const calendar = calendarOf(project);
  const schedule = buildSchedule(issues, {
    calendar,
    startDate: project.scheduleStart ?? today,
  });
  return { calendar, schedule, times: badgesFor(schedule, calendar) };
}
