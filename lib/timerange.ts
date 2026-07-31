/** Shared reporting-window presets and resolver used by the timesheet views. */

export const RANGE_PRESETS = [
  { key: "week", label: "This week" },
  { key: "last-week", label: "Last week" },
  { key: "month", label: "This month" },
  { key: "30d", label: "30 days" },
];

export type RangeBounds = { from: Date; to: Date; label: string; key: string };

/** Resolves the selected reporting window from query params. */
export function rangeBounds(range: string, fromParam?: string, toParam?: string): RangeBounds {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (range === "week") {
    const s = new Date(now);
    s.setDate(s.getDate() - s.getDay());
    s.setHours(0, 0, 0, 0);
    return { from: s, to: end, label: "This week", key: "week" };
  }
  if (range === "last-week") {
    const s = new Date(now);
    s.setDate(s.getDate() - s.getDay() - 7);
    s.setHours(0, 0, 0, 0);
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    e.setHours(23, 59, 59, 999);
    return { from: s, to: e, label: "Last week", key: "last-week" };
  }
  if (range === "month") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: s, to: end, label: "This month", key: "month" };
  }
  if (range === "custom" && fromParam) {
    const s = new Date(fromParam);
    s.setHours(0, 0, 0, 0);
    const e = toParam ? new Date(toParam) : new Date(now);
    e.setHours(23, 59, 59, 999);
    return { from: s, to: e, label: "Custom range", key: "custom" };
  }
  const s = new Date(now);
  s.setDate(s.getDate() - 30);
  s.setHours(0, 0, 0, 0);
  return { from: s, to: end, label: "Last 30 days", key: "30d" };
}

/** The Sunday-00:00 that starts the week containing `d` (local time). */
export function weekStartOf(d: Date | string) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

/** True when a preset button should render as the active selection. */
export function isActivePreset(presetKey: string, rangeKey: string) {
  if (presetKey === "30d") {
    return !["week", "last-week", "month", "custom"].includes(rangeKey);
  }
  return rangeKey === presetKey;
}
