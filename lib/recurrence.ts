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

/** Advances a date by one recurrence interval. */
export function advanceDate(date: Date, recurrence: string) {
  const d = new Date(date);
  if (recurrence === "DAILY") d.setDate(d.getDate() + 1);
  else if (recurrence === "WEEKLY") d.setDate(d.getDate() + 7);
  else if (recurrence === "MONTHLY") d.setMonth(d.getMonth() + 1);
  return d;
}
