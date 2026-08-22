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
      ...(canSeeAll
        ? {}
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
      s.doneCount++;
      if (!s.lastDone || t.completedAt > s.lastDone) s.lastDone = t.completedAt;
    } else if (t.missedAt || past) {
      state = "missed";
      s.missedCount++;
    } else {
      state = "pending";
    }
    s.cells.set(key, { id: t.id, state });
  }

  const list = Array.from(series.values()).sort((a, b) => a.title.localeCompare(b.title));

  // Today's progress across all jobs.
  const todayDone = list.filter((s) => s.cells.get(todayKey)?.state === "done").length;
  const todayTotal = list.filter((s) => s.cells.has(todayKey)).length;

  const monthLabel = monthStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const prev = new Date(year, month0 - 1, 1);
  const next = new Date(year, month0 + 1, 1);
  const mkMonth = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

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
          <Link href={`/recurring?month=${mkMonth(prev)}`} className="btn-secondary !py-1.5 text-sm">←</Link>
          <span className="min-w-36 text-center text-sm font-medium">{monthLabel}</span>
          <Link href={`/recurring?month=${mkMonth(next)}`} className="btn-secondary !py-1.5 text-sm">→</Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-200">
          {list.length} recurring jobs
        </span>
        {isCurrentMonth && (
          <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-700">
            {todayDone} / {todayTotal} done today
          </span>
        )}
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
