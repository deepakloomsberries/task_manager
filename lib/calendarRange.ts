/** Date maths for the Calendar page. Days are "YYYY-MM-DD" strings (no time zone games). */

export type CalView = "month" | "week" | "agenda";

const pad = (n: number) => String(n).padStart(2, "0");
export const toYmd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (s: string) => new Date(`${s}T00:00:00Z`);

export function addDays(day: string, n: number) {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toYmd(d);
}

/** Monday of the week containing `day`. */
export function mondayOf(day: string) {
  const wd = (utc(day).getUTCDay() + 6) % 7;
  return addDays(day, -wd);
}

export function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(utc(s).getTime()) && toYmd(utc(s)) === s;
}

/** The day the page is looking at: `d=YYYY-MM-DD`, the older `m=YYYY-MM`, else today. */
export function anchorFrom(sp: { d?: string; m?: string }, today: string) {
  if (isYmd(sp.d)) return sp.d;
  const m = sp.m?.match(/^(\d{4})-(\d{2})$/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2]}-01`;
  return today;
}

export function monthStartOf(day: string) {
  return `${day.slice(0, 7)}-01`;
}
export function monthEndOf(day: string) {
  const d = utc(monthStartOf(day));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return toYmd(d);
}
export function shiftMonth(day: string, n: number) {
  const d = utc(monthStartOf(day));
  d.setUTCMonth(d.getUTCMonth() + n);
  return toYmd(d);
}

/** Every day shown for a view: whole weeks (Mon–Sun) around the month, one week, or the month's days. */
export function visibleDays(view: CalView, anchor: string): string[] {
  let from: string, to: string;
  if (view === "week") {
    from = mondayOf(anchor);
    to = addDays(from, 6);
  } else if (view === "agenda") {
    from = monthStartOf(anchor);
    to = monthEndOf(anchor);
  } else {
    from = mondayOf(monthStartOf(anchor));
    to = addDays(mondayOf(monthEndOf(anchor)), 6);
  }
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 50; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Where ← / → go for a view. */
export function stepAnchor(view: CalView, anchor: string, dir: -1 | 1) {
  return view === "week" ? addDays(mondayOf(anchor), 7 * dir) : shiftMonth(anchor, dir);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

export function viewTitle(view: CalView, anchor: string) {
  if (view !== "week") return `${MONTHS[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}`;
  const a = mondayOf(anchor);
  const b = addDays(a, 6);
  const [ay, am, ad] = [a.slice(0, 4), Number(a.slice(5, 7)) - 1, Number(a.slice(8))];
  const [by, bm, bd] = [b.slice(0, 4), Number(b.slice(5, 7)) - 1, Number(b.slice(8))];
  if (ay !== by) return `${ad} ${SHORT[am]} ${ay} – ${bd} ${SHORT[bm]} ${by}`;
  if (am !== bm) return `${ad} ${SHORT[am]} – ${bd} ${SHORT[bm]} ${by}`;
  return `${ad}–${bd} ${MONTHS[am]} ${ay}`;
}

/** 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (day: string) => utc(day).getUTCDay();
