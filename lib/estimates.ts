/**
 * Estimate-vs-actual maths for the Reports page: how long tasks really took
 * compared with their estimate, overall and per person.
 */

export type Band = "under" | "on" | "over";

/** Within ±20–25% of the estimate counts as on target. */
export function band(ratio: number): Band {
  if (ratio < 0.8) return "under";
  if (ratio > 1.25) return "over";
  return "on";
}

type TaskLike = { id: number; title: string; assigneeId: number | null; estimateHours: number | null };

export type Compared = TaskLike & { estimate: number; actual: number; ratio: number; band: Band };

export type PersonAccuracy = { assigneeId: number; tasks: number; estimate: number; actual: number; ratio: number; band: Band };

/**
 * Compares estimated with logged hours. Tasks without an estimate are ignored;
 * tasks with an estimate but no time logged are counted as `untracked` rather
 * than skewing accuracy towards "finished in zero hours".
 */
export function compareEstimates(tasks: TaskLike[], actualByTask: Map<number, number>) {
  const compared: Compared[] = [];
  let untracked = 0;
  for (const t of tasks) {
    const estimate = t.estimateHours ?? 0;
    if (estimate <= 0) continue;
    const actual = actualByTask.get(t.id) ?? 0;
    if (actual <= 0) {
      untracked++;
      continue;
    }
    const ratio = actual / estimate;
    compared.push({ ...t, estimate, actual, ratio, band: band(ratio) });
  }

  const totalEstimate = compared.reduce((s, c) => s + c.estimate, 0);
  const totalActual = compared.reduce((s, c) => s + c.actual, 0);
  const counts = { under: 0, on: 0, over: 0 } as Record<Band, number>;
  for (const c of compared) counts[c.band]++;

  const people = new Map<number, PersonAccuracy>();
  for (const c of compared) {
    if (c.assigneeId == null) continue;
    const p = people.get(c.assigneeId) ?? { assigneeId: c.assigneeId, tasks: 0, estimate: 0, actual: 0, ratio: 0, band: "on" as Band };
    p.tasks++;
    p.estimate += c.estimate;
    p.actual += c.actual;
    people.set(c.assigneeId, p);
  }
  const byPerson = Array.from(people.values())
    .map((p) => ({ ...p, ratio: p.actual / p.estimate, band: band(p.actual / p.estimate) }))
    .sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1));

  return {
    compared,
    untracked,
    totalEstimate,
    totalActual,
    ratio: totalEstimate > 0 ? totalActual / totalEstimate : null,
    counts,
    byPerson,
  };
}

/** Open tasks that have already used more time than estimated, worst first. */
export function overBudget(tasks: TaskLike[], actualByTask: Map<number, number>, limit = 5) {
  return tasks
    .filter((t) => (t.estimateHours ?? 0) > 0 && (actualByTask.get(t.id) ?? 0) > (t.estimateHours ?? 0))
    .map((t) => ({ ...t, estimate: t.estimateHours!, actual: actualByTask.get(t.id)!, ratio: actualByTask.get(t.id)! / t.estimateHours! }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, limit);
}
