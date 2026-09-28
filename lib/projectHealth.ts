/** Accent colours a project card can use (Tailwind classes, kept literal for the JIT). */
export const PROJECT_COLORS: Record<string, { bar: string; dot: string; label: string }> = {
  sky: { bar: "bg-sky-500", dot: "bg-sky-500", label: "Blue" },
  violet: { bar: "bg-violet-500", dot: "bg-violet-500", label: "Purple" },
  emerald: { bar: "bg-emerald-500", dot: "bg-emerald-500", label: "Green" },
  amber: { bar: "bg-amber-500", dot: "bg-amber-500", label: "Amber" },
  rose: { bar: "bg-rose-500", dot: "bg-rose-500", label: "Red" },
  slate: { bar: "bg-slate-500", dot: "bg-slate-500", label: "Grey" },
};
export const colorOf = (c: string | null | undefined) => PROJECT_COLORS[c ?? ""] ?? PROJECT_COLORS.sky;

export type Health = "DONE" | "ON_TRACK" | "AT_RISK" | "LATE" | "PAUSED" | "ARCHIVED" | "NOT_STARTED";

export const HEALTH: Record<Health, { label: string; badge: string }> = {
  DONE: { label: "Completed", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  ON_TRACK: { label: "On track", badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  AT_RISK: { label: "At risk", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  LATE: { label: "Late", badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  PAUSED: { label: "On hold", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  ARCHIVED: { label: "Archived", badge: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  NOT_STARTED: { label: "Not started", badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

const DAY = 86_400_000;

/** Whole days from `now` until `due` (negative once it's past). */
export function daysLeft(due: Date, now = new Date()) {
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / DAY);
}

export function dueLabel(due: Date, now = new Date()) {
  const d = daysLeft(due, now);
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  if (d > 1) return `${d} days left`;
  return d === -1 ? "1 day late" : `${-d} days late`;
}

/**
 * How a project is doing, from its status, deadline and tasks:
 * - past its deadline with work left → LATE
 * - overdue tasks, or deadline within 7 days and less than 70% done, or behind
 *   the time elapsed between start and deadline by 25+ points → AT_RISK
 */
export function projectHealth(
  p: { status: string; startDate?: Date | null; dueDate?: Date | null; createdAt: Date },
  t: { total: number; done: number; overdue: number },
  now = new Date()
): Health {
  if (p.status === "COMPLETED") return "DONE";
  if (p.status === "ARCHIVED") return "ARCHIVED";
  if (p.status === "ON_HOLD") return "PAUSED";
  const pct = t.total ? t.done / t.total : 0;
  if (p.dueDate && daysLeft(p.dueDate, now) < 0 && pct < 1) return "LATE";
  if (t.total === 0) return "NOT_STARTED";
  if (t.overdue > 0) return "AT_RISK";
  if (p.dueDate && pct < 1) {
    const left = daysLeft(p.dueDate, now);
    if (left <= 7 && pct < 0.7) return "AT_RISK";
    const start = (p.startDate ?? p.createdAt).getTime();
    const span = p.dueDate.getTime() - start;
    if (span > 0) {
      const elapsed = Math.min(1, Math.max(0, (now.getTime() - start) / span));
      if (elapsed - pct >= 0.25) return "AT_RISK";
    }
  }
  return "ON_TRACK";
}

/** "3h ago", "2d ago", or a date for anything older than a month. */
export function ago(d: Date, now = new Date()) {
  const s = Math.max(0, (now.getTime() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
