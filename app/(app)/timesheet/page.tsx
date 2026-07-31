import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createTimeEntry, deleteTimeEntry } from "@/lib/actions/time";
import ActiveTimerBanner from "@/components/ActiveTimerBanner";
import { fmtDate, toInputDate, fmtHours } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const user = await requireUser();

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [entries, tasks, projects, activeTimer] = await Promise.all([
    db.timeEntry.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: "desc" },
      include: { task: true, project: true },
    }),
    db.task.findMany({
      where: { assigneeId: user.id, status: { not: "DONE" }, deletedAt: null },
      orderBy: { title: "asc" },
    }),
    db.project.findMany({
      where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
      orderBy: { name: "asc" },
    }),
    db.taskTimer.findUnique({
      where: { userId: user.id },
      include: { task: { select: { id: true, title: true } } },
    }),
  ]);

  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekHours = entries
    .filter((e) => new Date(e.date) >= weekStart)
    .reduce((s, e) => s + e.hours, 0);

  // Last 7 days for the mini bar chart, scaled to the busiest day so short days
  // still read clearly (with a small floor so a 10-minute bar isn't invisible).
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - i));
    day.setHours(0, 0, 0, 0);
    const next = new Date(day.getTime() + 86400000);
    const hours = entries
      .filter((e) => new Date(e.date) >= day && new Date(e.date) < next)
      .reduce((s, e) => s + e.hours, 0);
    return {
      label: day.toLocaleDateString("en-GB", { weekday: "short" }),
      hours,
      isToday: i === 6,
    };
  });
  const peak = Math.max(...week.map((d) => d.hours), 1 / 6);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Time sheet</h1>
          <p className="text-sm text-slate-500">Log the hours you spend on tasks and projects.</p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <div className="text-2xl font-bold text-sky-600">{fmtHours(weekHours)}</div>
            <div className="text-xs text-slate-500">This week</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{fmtHours(totalHours)}</div>
            <div className="text-xs text-slate-500">Last 30 days</div>
          </div>
        </div>
      </div>

      {searchParams.error === "invalid" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t read that time. Try formats like <b>2h 30m</b>, <b>0:45</b>, <b>45m</b> or a
          decimal such as <b>2.5</b> (must be between 0 and 24 hours).
        </div>
      )}

      {activeTimer && (
        <ActiveTimerBanner
          taskId={activeTimer.task.id}
          title={activeTimer.task.title}
          startedAt={activeTimer.startedAt.toISOString()}
        />
      )}

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">Last 7 days</h2>
        <div className="flex h-28 items-end gap-2">
          {week.map((d, i) => {
            const pct = d.hours > 0 ? Math.max(8, Math.round((d.hours / peak) * 100)) : 0;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-slate-500">{d.hours > 0 ? fmtHours(d.hours) : ""}</span>
                <div className="flex h-16 w-full items-end rounded bg-slate-100">
                  <div
                    className={`w-full rounded ${d.isToday ? "bg-sky-500" : "bg-sky-300"}`}
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <span className={`text-[10px] ${d.isToday ? "font-semibold text-sky-600" : "text-slate-400"}`}>
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-5">
        <form action={createTimeEntry} className="grid items-end gap-3 md:grid-cols-6">
          <div>
            <label className="label">Date *</label>
            <input
              name="date"
              type="date"
              required
              defaultValue={toInputDate(new Date())}
              className="input"
            />
          </div>
          <div>
            <label className="label">Hours *</label>
            <input
              name="hours"
              type="text"
              required
              className="input"
              placeholder="2h 30m, 0:45 or 2.5"
              title="Enter time as 2h 30m, 0:45, 45m or a decimal like 2.5"
            />
          </div>
          <div>
            <label className="label">Task</label>
            <select name="taskId" className="input">
              <option value="">— None —</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Project</label>
            <select name="projectId" className="input">
              <option value="">— None —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Note</label>
            <input name="note" className="input" placeholder="What did you work on?" />
          </div>
          <button type="submit" className="btn-primary">
            Log time
          </button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Date</th>
              <th className="th">Hours</th>
              <th className="th">Task</th>
              <th className="th">Project</th>
              <th className="th">Note</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="td py-10 text-center text-slate-400">
                  No time logged in the last 30 days.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="td">{fmtDate(e.date)}</td>
                <td className="td font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {fmtHours(e.hours)}
                    {e.source === "timer" && (
                      <span
                        title="Tracked with the task timer"
                        className="badge bg-sky-100 text-sky-700 !px-1.5 !py-0 text-[10px]"
                      >
                        ⏱
                      </span>
                    )}
                  </span>
                </td>
                <td className="td text-slate-600">{e.task?.title ?? "—"}</td>
                <td className="td text-slate-600">{e.project?.name ?? "—"}</td>
                <td className="td text-slate-600">{e.note ?? "—"}</td>
                <td className="td text-right">
                  <form action={deleteTimeEntry}>
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" className="text-xs text-slate-400 hover:text-red-600">
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
