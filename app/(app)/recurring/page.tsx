import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isManagerOrAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Local Y-M-D key so instances line up with calendar columns. */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Cell = { id: number; state: "done" | "missed" | "pending"; };

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
    cells: Map<string, Cell>;
    lastDone: Date | null;
    doneCount: number;
    missedCount: number;
  };
  // A day can hold more than one occurrence (e.g. a duplicate that the nightly
  // roll-over archived as missed alongside the live one). Show the most
  // meaningful: done beats a still-live pending, which beats missed.
  const RANK: Record<Cell["state"], number> = { done: 3, pending: 2, missed: 1 };
  const series = new Map<string, Series>();
  for (const t of rows) {
    let s = series.get(t.seriesId!);
    if (!s) {
      s = { seriesId: t.seriesId!, title: t.title, assignee: t.assignee?.name ?? null, cells: new Map(), lastDone: null, doneCount: 0, missedCount: 0 };
      series.set(t.seriesId!, s);
    }
    // Keep the most recent title/assignee as the label.
    s.title = t.title;
    s.assignee = t.assignee?.name ?? s.assignee;
    if (!t.dueDate) continue;
    const key = ymd(t.dueDate);
    const past = key < todayKey;
    let state: Cell["state"];
    if (t.completedAt) {
      state = "done";
      if (!s.lastDone || t.completedAt > s.lastDone) s.lastDone = t.completedAt;
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
  const list = Array.from(series.values()).sort((a, b) => a.title.localeCompare(b.title));
  for (const s of list) {
    for (const c of Array.from(s.cells.values())) {
      if (c.state === "done") s.doneCount++;
      else if (c.state === "missed") s.missedCount++;
    }
  }

  // Today's progress across all jobs.
  const todayDone = list.filter((s) => s.cells.get(todayKey)?.state === "done").length;
  const todayTotal = list.filter((s) => s.cells.has(todayKey)).length;

  const monthLabel = monthStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const prev = new Date(year, month0 - 1, 1);
  const next = new Date(year, month0 + 1, 1);
  const mkMonth = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  // Build a /recurring URL keeping the month + assignee filter in sync.
  const href = (opts: { month?: string; assignee?: number | null }) => {
    const p = new URLSearchParams();
    p.set("month", opts.month ?? mkMonth(monthStart));
    const a = opts.assignee === undefined ? selectedAssignee : opts.assignee;
    if (a) p.set("assignee", String(a));
    if (q) p.set("q", q);
    return `/recurring?${p.toString()}`;
  };

  const CELL: Record<Cell["state"], string> = {
    done: "bg-green-500 text-white",
    missed: "bg-red-400 text-white",
    pending: "bg-amber-100 text-amber-700 ring-1 ring-amber-300",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Recurring tasks</h1>
          <p className="text-sm text-slate-500">
            Every recurring job, day by day. <span className="text-green-600">Green</span> = done that
            day, <span className="text-red-500">red</span> = missed,{" "}
            <span className="text-amber-600">amber</span> = today, still pending.
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
            <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-700">
              {todayDone} / {todayTotal} done today
            </span>
          )}
        </div>
        <form method="GET" action="/recurring" className="flex items-center gap-2">
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

      {list.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-400">
          No recurring tasks this month. Set a task&apos;s recurrence to Daily/Weekly/Monthly to see it here.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="min-w-max text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium text-slate-500 dark:bg-slate-800">
                  Task
                </th>
                {days.map((d) => {
                  const key = ymd(d);
                  const isToday = key === todayKey;
                  return (
                    <th
                      key={key}
                      className={`w-7 px-0 py-2 text-center text-[10px] font-medium ${
                        isToday ? "text-sky-600" : "text-slate-400"
                      }`}
                      title={d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
                    >
                      {d.getDate()}
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-center font-medium text-slate-500" title="Done / missed this month">
                  ✓/✕
                </th>
                <th className="px-3 py-2 text-right font-medium text-slate-500">Last done</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {list.map((s) => (
                <tr key={s.seriesId} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                  <td className="sticky left-0 z-10 max-w-72 truncate bg-white px-3 py-2 dark:bg-slate-800">
                    <div className="truncate font-medium" title={s.title}>{s.title}</div>
                    {s.assignee && <div className="text-[11px] text-slate-400">{s.assignee}</div>}
                  </td>
                  {days.map((d) => {
                    const key = ymd(d);
                    const cell = s.cells.get(key);
                    if (!cell) {
                      return <td key={key} className="px-0.5 py-1 text-center"><span className="mx-auto block h-5 w-5 rounded bg-slate-50 dark:bg-slate-700/40" /></td>;
                    }
                    const label = cell.state === "done" ? "✓" : cell.state === "missed" ? "✕" : "•";
                    return (
                      <td key={key} className="px-0.5 py-1 text-center">
                        <Link
                          href={`/tasks/${cell.id}`}
                          title={`${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} — ${cell.state}`}
                          className={`mx-auto flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${CELL[cell.state]}`}
                        >
                          {label}
                        </Link>
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap px-3 py-2 text-center text-xs">
                    <span className="font-medium text-green-600">{s.doneCount}</span>
                    <span className="text-slate-300"> / </span>
                    <span className="font-medium text-red-500">{s.missedCount}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-slate-500">
                    {s.lastDone ? s.lastDone.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
