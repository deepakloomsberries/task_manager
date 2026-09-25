/** Pure recurrence helpers, safe to import from server actions and routes. */

/**
 * A stable id shared by every occurrence of one recurring job. Derived from
 * the recurrence + assignee + title so identical daily jobs line up into a
 * single series (and accidental duplicates collapse together).
 */
export function seriesKeyFor(t: { recurrence: string | null; assigneeId: number | null; title: string }) {
  if (!t.recurrence) return null;
  const norm = t.title.trim().toLowerCase().replace(/\s+/g, " ");
  return `${t.recurrence}:${t.assigneeId ?? 0}:${norm}`;
}

/**
 * Advances a date by one recurrence interval. For MONTHLY, `anchorDay` is the
 * series' own day of the month, so 31 Jan → 28 Feb → 31 Mar (no drift).
 */
export function advanceDate(date: Date, recurrence: string, anchorDay?: number | null) {
  const d = new Date(date);
  if (recurrence === "DAILY") d.setDate(d.getDate() + 1);
  else if (recurrence === "WEEKLY") d.setDate(d.getDate() + 7);
  else if (recurrence === "MONTHLY") {
    // Clamp to the last day of the next month so e.g. 31 Jan → 28/29 Feb
    // instead of overflowing into March.
    const day = anchorDay && anchorDay >= 1 && anchorDay <= 31 ? anchorDay : d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  }
  return d;
}
