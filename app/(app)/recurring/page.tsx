import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isManagerOrAdmin } from "@/lib/auth";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

/** Local Y-M-D key so instances line up with calendar columns. */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Cell = { id: number; state: "done" | "missed" | "pending" | "retired"; };

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const viewer = await requireUser();
  const canSeeAll = isManagerOrAdmin(viewer.role);

  // Per-person filter (managers/admins only — others are scoped to themselves).
  const assigneeOptions = canSeeAll
    ? await db.user.findMany({
        where: { active: true, tasksAssigned: { some: { seriesId: { not: null }, recurrence: { not: null } } } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];
  const selectedAssignee = canSeeAll && searchParams.assignee ? Number(searchParams.assignee) : null;
  const q = (searchParams.q ?? "").trim();

  const now = new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(searchParams.month ?? "");
  const year = m ? Number(m[1]) : now.getFullYear();
  const month0 = m ? Number(m[2]) - 1 : now.getMonth();
  const monthStart = new Date(year, month0, 1);
  const monthEnd = new Date(year, month0 + 1, 1);
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month0, i + 1));
  const todayKey = ymd(now);
  const isCurrentMonth = year === now.getFullYear() && month0 === now.getMonth();

  // Every recurring occurrence that falls in this month (live or archived).
  const rows = await db.task.findMany({
    where: {
      seriesId: { not: null },
      recurrence: { not: null },
      dueDate: { gte: monthStart, lt: monthEnd },
      ...(q ? { title: { contains: q } } : {}),
      ...(canSeeAll
        ? selectedAssignee
          ? { assigneeId: selectedAssignee }
          : {}
        : { OR: [{ assigneeId: viewer.id }, { collaborators: { some: { userId: viewer.id } } }] }),
    },
    select: {
      id: true,
      title: true,
      seriesId: true,
      dueDate: true,
      completedAt: true,
      missedAt: true,
      deletedAt: true,
      assignee: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  // Group into one row per series.
  type Series = {
    seriesId: string;
    title: string;
    assignee: string | null;
    openId: number; // the most recent occurrence, to open from the row
    cells: Map<string, Cell>;
    lastDone: Date | null;
    doneCount: number;
    missedCount: number;
    retired: boolean; // its most recent occurrence was deleted — series is dormant
  };
  // A day can hold more than one occurrence (e.g. a duplicate that the nightly
  // roll-over archived as missed alongside the live one). Show the most
  // meaningful: done beats a still-live pending, which beats missed, which
  // beats a manually-retired duplicate (nothing to see there).
  const RANK: Record<Cell["state"], number> = { done: 4, pending: 3, missed: 2, retired: 1 };
  const series = new Map<string, Series>();
  for (const t of rows) {
    let s = series.get(t.seriesId!);
    if (!s) {
      s = { seriesId: t.seriesId!, title: t.title, assignee: t.assignee?.name ?? null, openId: t.id, cells: new Map(), lastDone: null, doneCount: 0, missedCount: 0, retired: false };
      series.set(t.seriesId!, s);
    }
    // Keep the most recent title/assignee/id as the label (rows are date-asc).
    s.title = t.title;
    s.assignee = t.assignee?.name ?? s.assignee;
    s.openId = t.id;
    if (!t.dueDate) continue;
    const key = ymd(t.dueDate);
    const past = key < todayKey;
    let state: Cell["state"];
    if (t.completedAt) {
      state = "done";
      if (!s.lastDone || t.completedAt > s.lastDone) s.lastDone = t.completedAt;
    } else if (t.deletedAt && !t.missedAt) {
      // The nightly roll-over always stamps missedAt (or completedAt) on
      // anything it archives, so deletedAt-without-either means a person
      // deleted this occurrence by hand — retired, not missed.
      state = "retired";
    } else if (t.missedAt || past) {
      state = "missed";
    } else {
      state = "pending";
    }
    const existing = s.cells.get(key);
    // Prefer the higher-ranked state; on a tie, prefer the live (undeleted) row.
    if (!existing || RANK[state] > RANK[existing.state] || (RANK[state] === RANK[existing.state] && !t.deletedAt)) {
      s.cells.set(key, { id: t.id, state });
    }
  }

  // Per-row tallies come from the final cells, so duplicates never double-count.
  const list = Array.from(series.values());
  for (const s of list) {
    for (const c of Array.from(s.cells.values())) {
      if (c.state === "done") s.doneCount++;
      else if (c.state === "missed") s.missedCount++;
    }
    // The series is dormant if its most recent occurrence (this month) is the
    // retired one — nothing live is left to roll forward, so nobody should be
    // chasing this row until it's recreated.
    const lastKey = Array.from(s.cells.keys()).sort().pop();
    s.retired = lastKey !== undefined && s.cells.get(lastKey)?.state === "retired";
  }
  const rate = (s: Series) => {
    const t = s.doneCount + s.missedCount;
    return t ? s.doneCount / t : 1;
  };
  // Sort: by name, most-missed first, or worst completion rate (spot problems).
  const sort = searchParams.sort ?? "name";
  list.sort((a, b) => {
    if (sort === "missed") return b.missedCount - a.missedCount || a.title.localeCompare(b.title);
    if (sort === "rate") return rate(a) - rate(b) || b.missedCount - a.missedCount;
    if (sort === "recent") return (b.lastDone?.getTime() ?? 0) - (a.lastDone?.getTime() ?? 0);
    return a.title.localeCompare(b.title);
  });

  // Per-day metadata drives the weekend tint, weekday letters and today column.
  const DOW = ["S", "M", "T", "W", "T", "F", "S"];
  const dayMeta = days.map((d) => {
    const dow = d.getDay();
    return { d, key: ymd(d), letter: DOW[dow], isSun: dow === 0, isSat: dow === 6, isToday: ymd(d) === todayKey };
  });

  // Today's progress + this month's totals.
  const todayDone = list.filter((s) => s.cells.get(todayKey)?.state === "done").length;
  const todayTotal = list.filter((s) => {
    const c = s.cells.get(todayKey);
    return c && c.state !== "retired";
  }).length;
  const monthDone = list.reduce((a, s) => a + s.doneCount, 0);
  const monthMissed = list.reduce((a, s) => a + s.missedCount, 0);
  const monthRate = monthDone + monthMissed ? Math.round((monthDone / (monthDone + monthMissed)) * 100) : null;
  const retiredCount = list.filter((s) => s.retired).length;

  // Per-day totals across all jobs (footer bar row).
  const dayDone = new Map<string, number>();
  const dayScheduled = new Map<string, number>();
  for (const s of list) {
    for (const m of dayMeta) {
      const c = s.cells.get(m.key);
      if (!c) continue;
      dayScheduled.set(m.key, (dayScheduled.get(m.key) ?? 0) + 1);
      if (c.state === "done") dayDone.set(m.key, (dayDone.get(m.key) ?? 0) + 1);
    }
  }
  const dayPeak = Math.max(1, ...dayMeta.map((m) => dayScheduled.get(m.key) ?? 0));

  // Current streak: consecutive done days ending at the most recent scheduled
  // day (today still pending doesn't break it).
  const streakOf = (s: Series) => {
    let n = 0;
    for (let i = dayMeta.length - 1; i >= 0; i--) {
      const m = dayMeta[i];
      if (m.key > todayKey) continue;
      const c = s.cells.get(m.key);
      if (!c || c.state === "pending") continue;
      if (c.state === "done") n++;
      else break;
    }
    return n;
  };

  const monthLabel = monthStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const prev = new Date(year, month0 - 1, 1);
  const next = new Date(year, month0 + 1, 1);
  const mkMonth = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  // Build a /recurring URL keeping the month + assignee filter in sync.
  const href = (opts: { month?: string; assignee?: number | null; sort?: string }) => {
    const p = new URLSearchParams();
    p.set("month", opts.month ?? mkMonth(monthStart));
    const a = opts.assignee === undefined ? selectedAssignee : opts.assignee;
    if (a) p.set("assignee", String(a));
    if (q) p.set("q", q);
    const so = opts.sort === undefined ? sort : opts.sort;
    if (so && so !== "name") p.set("sort", so);
    return `/recurring?${p.toString()}`;
  };

  const CELL: Record<Cell["state"], string> = {
    done: "bg-green-500 text-white shadow-sm",
    missed: "bg-rose-500 text-white shadow-sm",
    pending: "bg-amber-100 text-amber-700 ring-1 ring-amber-400",
    retired: "bg-slate-300 text-slate-500 dark:bg-slate-600 dark:text-slate-400",
  };
  const SORTS: { key: string; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "missed", label: "Most missed" },
    { key: "rate", label: "Worst rate" },
    { key: "recent", label: "Recently done" },
  ];

  return (
    <div className="space-y-4">
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Recurring tasks</h1>
          <p className="text-sm text-slate-500">
            Every recurring job, day by day. <span className="font-medium text-green-600">✓ done</span>,{" "}
            <span className="font-medium text-rose-500">✕ missed</span>,{" "}
            <span className="font-medium text-amber-600">• today</span>,{" "}
            <span className="font-medium text-slate-500">– retired</span> (that day deleted by hand).
            A <span className="font-medium text-rose-500 line-through">struck-through</span> task name
            means the whole job is retired — its most recent occurrence was deleted and nothing has
            replaced it. Weekends (<span className="text-rose-500">Sun</span>) are tinted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={href({ month: mkMonth(prev) })} className="btn-secondary !py-1.5 text-sm">←</Link>
          <span className="min-w-36 text-center text-sm font-medium">{monthLabel}</span>
          <Link href={href({ month: mkMonth(next) })} className="btn-secondary !py-1.5 text-sm">→</Link>
        </div>
      </div>

      {canSeeAll && assigneeOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-slate-500">Person:</span>
          <Link
            href={href({ assignee: null })}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              !selectedAssignee ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
            }`}
          >
            Everyone
          </Link>
          {assigneeOptions.map((u) => (
            <Link
              key={u.id}
              href={href({ assignee: u.id })}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                selectedAssignee === u.id ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
              }`}
            >
              {u.name}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-200">
            {list.length} {q ? "matching" : "recurring"} jobs
          </span>
          {isCurrentMonth && (
            <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-700">
              {todayDone} / {todayTotal} done today
            </span>
          )}
          <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-700">✓ {monthDone} done</span>
          <span className="rounded-full bg-rose-100 px-3 py-1 font-medium text-rose-700">✕ {monthMissed} missed</span>
          {retiredCount > 0 && (
            <span className="rounded-full bg-slate-200 px-3 py-1 font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              – {retiredCount} retired
            </span>
          )}
          {monthRate !== null && (
            <span className="rounded-full bg-slate-800 px-3 py-1 font-medium text-white dark:bg-slate-200 dark:text-slate-800">
              {monthRate}% completion
            </span>
          )}
        </div>
        <form method="GET" action="/recurring" className="flex items-center gap-2">
          {sort !== "name" && <input type="hidden" name="sort" value={sort} />}
          <input type="hidden" name="month" value={mkMonth(monthStart)} />
          {selectedAssignee && <input type="hidden" name="assignee" value={selectedAssignee} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search tasks…"
            className="input !py-1.5 w-48 text-sm"
          />
          <button type="submit" className="btn-secondary !py-1.5 text-sm">Search</button>
          {q && (
            <Link
              href={`/recurring?month=${mkMonth(monthStart)}${selectedAssignee ? `&assignee=${selectedAssignee}` : ""}`}
              className="text-xs text-slate-500 hover:underline"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-slate-500">Sort:</span>
        {SORTS.map((so) => (
          <Link
            key={so.key}
            href={href({ sort: so.key })}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              sort === so.key ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-800" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
            }`}
          >
            {so.label}
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-400">
          No recurring tasks this month. Set a task&apos;s recurrence to Daily/Weekly/Monthly to see it here.
        </div>
      ) : (
        <div className="card max-h-[74vh] overflow-auto p-0">
          <table className="min-w-max border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 border-b border-slate-200 bg-white px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                  Task
                </th>
                {dayMeta.map((m) => (
                  <th
                    key={m.key}
                    className={`sticky top-0 z-20 w-8 border-b px-0 py-1.5 text-center font-medium ${
                      m.isToday
                        ? "border-sky-300 bg-sky-100 dark:bg-sky-900/50"
                        : m.isSun
                          ? "border-slate-200 bg-rose-50 dark:border-slate-700 dark:bg-rose-950/30"
                          : m.isSat
                            ? "border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-700/40"
                            : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                    }`}
                    title={m.d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
                  >
                    <div className={`text-[9px] uppercase ${m.isSun ? "text-rose-400" : m.isToday ? "text-sky-600" : "text-slate-300"}`}>{m.letter}</div>
                    <div className={`text-[11px] ${m.isToday ? "font-bold text-sky-700 dark:text-sky-300" : m.isSun ? "text-rose-500" : "text-slate-500"}`}>{m.d.getDate()}</div>
                  </th>
                ))}
                <th className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                  This month
                </th>
                <th className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                  Last done
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((s, ri) => {
                const total = s.doneCount + s.missedCount;
                const pct = total ? Math.round((s.doneCount / total) * 100) : null;
                const zebra = ri % 2 === 1;
                const rowBg = zebra ? "bg-slate-50/60 dark:bg-slate-800/40" : "bg-white dark:bg-slate-800";
                return (
                  <tr key={s.seriesId} className="group">
                    <td className={`sticky left-0 z-10 w-80 min-w-[16rem] max-w-[24rem] border-b border-slate-100 px-4 py-2.5 dark:border-slate-700 ${rowBg} group-hover:bg-sky-50 dark:group-hover:bg-slate-700/60`}>
                      {s.retired ? (
                        // Deleted by hand and nothing has replaced it — the last
                        // occurrence isn't live, so there's nowhere to link.
                        // Recreating a task with this exact title, assignee and
                        // recurrence picks the same series back up.
                        <div
                          className="flex items-center gap-1.5 font-medium leading-snug text-rose-500 line-through decoration-2 dark:text-rose-400"
                          title={`${s.title} — retired: deleted, no longer tracked`}
                        >
                          <span className="line-clamp-2">{s.title}</span>
                        </div>
                      ) : (
                        <Link href={`/tasks/${s.openId}`} className="block font-medium leading-snug hover:text-sky-600 hover:underline" title={s.title}>
                          <span className="line-clamp-2">{s.title}</span>
                        </Link>
                      )}
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {s.assignee && <span className="text-[11px] text-slate-400">{s.assignee}</span>}
                        {s.retired && (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                            Retired
                          </span>
                        )}
                      </div>
                    </td>
                    {dayMeta.map((m) => {
                      const cell = s.cells.get(m.key);
                      const tint = m.isToday
                        ? "bg-sky-50/70 dark:bg-sky-900/20"
                        : m.isSun
                          ? "bg-rose-50/50 dark:bg-rose-950/20"
                          : m.isSat
                            ? "bg-slate-50 dark:bg-slate-700/20"
                            : "";
                      if (!cell) {
                        return (
                          <td key={m.key} className={`border-b border-slate-100 px-0.5 py-1 text-center dark:border-slate-700 ${tint}`}>
                            <span className="mx-auto block h-1.5 w-1.5 rounded-full bg-slate-200 dark:bg-slate-600" />
                          </td>
                        );
                      }
                      const label = cell.state === "done" ? "✓" : cell.state === "missed" ? "✕" : cell.state === "retired" ? "–" : "•";
                      const dayLabel = m.d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
                      if (cell.state === "retired") {
                        // Deleted by hand — there's no live task to open, so this
                        // isn't a link, just a muted marker so it stops reading as
                        // an unresolved miss.
                        return (
                          <td key={m.key} className={`border-b border-slate-100 px-0.5 py-1 text-center dark:border-slate-700 ${tint}`}>
                            <span
                              title={`${dayLabel} — retired (deleted, not tracked)`}
                              className={`mx-auto flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${CELL.retired}`}
                            >
                              {label}
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td key={m.key} className={`border-b border-slate-100 px-0.5 py-1 text-center dark:border-slate-700 ${tint}`}>
                          <Link
                            href={`/tasks/${cell.id}`}
                            title={`${dayLabel} — ${cell.state}`}
                            className={`mx-auto flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold transition hover:scale-110 ${CELL[cell.state]}`}
                          >
                            {label}
                          </Link>
                        </td>
                      );
                    })}
                    <td className={`whitespace-nowrap border-b border-slate-100 px-4 py-2.5 dark:border-slate-700 ${rowBg} group-hover:bg-sky-50 dark:group-hover:bg-slate-700/60`}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-rose-200 dark:bg-rose-900/50">
                          <div className="h-full rounded-full bg-green-500" style={{ width: `${pct ?? 0}%` }} />
                        </div>
                        {pct !== null && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                              pct >= 80 ? "bg-green-100 text-green-700" : pct >= 50 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {pct}%
                          </span>
                        )}
                        <span className="text-[11px] tabular-nums text-slate-400">
                          <span className="text-green-600">{s.doneCount}</span>/<span className="text-rose-500">{s.missedCount}</span>
                        </span>
                        {(() => {
                          const st = streakOf(s);
                          return st >= 2 ? <span className="text-[11px] font-semibold text-orange-500" title={`${st}-day streak`}>🔥{st}</span> : null;
                        })()}
                      </div>
                    </td>
                    <td className={`whitespace-nowrap border-b border-slate-100 px-4 py-2.5 text-right text-xs text-slate-500 dark:border-slate-700 ${rowBg} group-hover:bg-sky-50 dark:group-hover:bg-slate-700/60`}>
                      {s.lastDone ? s.lastDone.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky left-0 z-10 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                  Done that day
                </td>
                {dayMeta.map((m) => {
                  const done = dayDone.get(m.key) ?? 0;
                  const sched = dayScheduled.get(m.key) ?? 0;
                  const h = sched ? Math.max(3, Math.round((sched / dayPeak) * 26)) : 0;
                  const dh = sched ? Math.round((done / sched) * h) : 0;
                  return (
                    <td key={m.key} className={`border-t border-slate-200 px-0.5 py-1 align-bottom dark:border-slate-700 ${m.isToday ? "bg-sky-50/70 dark:bg-sky-900/20" : m.isSun ? "bg-rose-50/50 dark:bg-rose-950/20" : ""}`} title={sched ? `${done}/${sched} done` : "no jobs"}>
                      <div className="mx-auto flex h-[26px] w-4 items-end overflow-hidden rounded bg-slate-200 dark:bg-slate-600">
                        <div className="w-full rounded bg-green-500" style={{ height: `${dh}px` }} />
                      </div>
                      <div className="mt-0.5 text-center text-[9px] tabular-nums text-slate-400">{sched ? done : ""}</div>
                    </td>
                  );
                })}
                <td className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" />
                <td className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
