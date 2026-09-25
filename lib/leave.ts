/**
 * Leave & holiday date maths. Leave and holiday dates are calendar days stored
 * as UTC midnight ("2026-10-02T00:00:00Z"), so everything here works in
 * "YYYY-MM-DD" strings to stay clear of time-zone drift.
 */

export const LEAVE_TYPES = [
  { value: "ANNUAL", label: "Annual leave", emoji: "🌴", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  { value: "SICK", label: "Sick leave", emoji: "🤒", badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
  { value: "CASUAL", label: "Casual leave", emoji: "☕", badge: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
  { value: "UNPAID", label: "Unpaid leave", emoji: "⏸️", badge: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  { value: "OTHER", label: "Other", emoji: "📌", badge: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" },
] as const;

export const LEAVE_STATUSES = {
  PENDING: { label: "Pending", badge: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  APPROVED: { label: "Approved", badge: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
  REJECTED: { label: "Rejected", badge: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
  CANCELLED: { label: "Cancelled", badge: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
} as const;

/** Longest single request, in calendar days. */
export const MAX_LEAVE_SPAN_DAYS = 60;

export function leaveType(value: string) {
  return LEAVE_TYPES.find((t) => t.value === value) ?? LEAVE_TYPES[LEAVE_TYPES.length - 1];
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" of a date-only value stored as UTC midnight. */
export function ymd(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" of a day in the server's local time (e.g. a Workload column). */
export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Today's date in an office's time zone, as "YYYY-MM-DD". */
export function todayIn(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Parses "YYYY-MM-DD" into the stored form (UTC midnight), or null if invalid. */
export function parseYmd(s: unknown): Date | null {
  if (typeof s !== "string" || !YMD.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return isNaN(d.getTime()) || ymd(d) !== s ? null : d;
}

/** Every calendar day from start to end inclusive, as "YYYY-MM-DD". */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`).getTime();
  while (d.getTime() <= last && out.length <= 3700) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Parses Company.weekendDays ("0,6") into a set of weekday numbers. */
export function weekendSet(weekendDays: string | null | undefined): Set<number> {
  return new Set(
    String(weekendDays ?? "")
      .split(",")
      .filter((x) => x.trim() !== "") // Number("") is 0 — an empty setting must not mean Sunday
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  );
}

export function weekday(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** A normal working day for this office: not a weekend day and not a holiday. */
export function isWorkingDay(day: string, weekend: Set<number>, holidays: Set<string>): boolean {
  return !weekend.has(weekday(day)) && !holidays.has(day);
}

/**
 * Working days a leave uses: weekends and holidays in the range don't count,
 * and a half day counts 0.5 (only meaningful for a single-day leave).
 */
export function countLeaveDays(
  leave: { start: string; end: string; halfDay?: boolean },
  weekend: Set<number>,
  holidays: Set<string>
): number {
  const n = eachDay(leave.start, leave.end).filter((d) => isWorkingDay(d, weekend, holidays)).length;
  return leave.halfDay && leave.start === leave.end ? Math.min(n, 0.5) : n;
}

type LeaveLike = { userId: number; startDate: Date | string; endDate: Date | string; status: string };

/** Whether an approved leave covers the given day. */
export function covers(l: LeaveLike, day: string): boolean {
  return l.status === "APPROVED" && ymd(l.startDate) <= day && day <= ymd(l.endDate);
}

/** Two date ranges ("YYYY-MM-DD", inclusive) share at least one day. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** A short human range, e.g. "2 Oct", "2–4 Oct", "30 Sep – 2 Oct". */
export function fmtRange(start: Date | string, end: Date | string): string {
  const a = new Date(start);
  const b = new Date(end);
  const opts = { timeZone: "UTC", day: "numeric", month: "short" } as const;
  if (ymd(a) === ymd(b)) return a.toLocaleDateString("en-GB", opts);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${a.getUTCDate()}–${b.toLocaleDateString("en-GB", opts)}`;
  }
  return `${a.toLocaleDateString("en-GB", opts)} – ${b.toLocaleDateString("en-GB", opts)}`;
}

/** "1 day", "0.5 day", "3 days". */
export function fmtDays(n: number): string {
  return `${n} day${n === 1 || n === 0.5 ? "" : "s"}`;
}
