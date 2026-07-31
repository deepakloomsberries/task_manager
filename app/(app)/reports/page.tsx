import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { TASK_STATUSES, fmtHours } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requireUser();
  const teamWide = isManagerOrAdmin(user.role);

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [users, tasks, timeEntries] = await Promise.all([
    db.user.findMany({
      where: { active: true },
      include: { company: true, department: true },
      orderBy: { name: "asc" },
    }),
    db.task.findMany({ where: { deletedAt: null }, include: { project: true } }),
    db.timeEntry.findMany({ where: { date: { gte: since } } }),
  ]);

  const statusCounts = TASK_STATUSES.map((s) => ({
    ...s,
    count: tasks.filter((t) => t.status === s.value).length,
  }));
  const totalTasks = tasks.length;
  const overdue = tasks.filter(
    (t) => t.dueDate && t.status !== "DONE" && new Date(t.dueDate) < new Date()
  ).length;

  const perUser = (teamWide ? users : users.filter((u) => u.id === user.id)).map((u) => {
    const uTasks = tasks.filter((t) => t.assigneeId === u.id);
    const uHours = timeEntries
      .filter((e) => e.userId === u.id)
      .reduce((s, e) => s + e.hours, 0);
    return {
      user: u,
      open: uTasks.filter((t) => t.status !== "DONE").length,
      done: uTasks.filter((t) => t.status === "DONE").length,
      overdue: uTasks.filter(
        (t) => t.dueDate && t.status !== "DONE" && new Date(t.dueDate) < new Date()
      ).length,
      hours: uHours,
    };
  });

  const projects = await db.project.findMany({
    include: { company: true, _count: { select: { tasks: true } } },
    orderBy: { name: "asc" },
  });
  const perProject = projects.map((p) => {
    const pTasks = tasks.filter((t) => t.projectId === p.id);
    const done = pTasks.filter((t) => t.status === "DONE").length;
    return {
      project: p,
      total: pTasks.length,
      done,
      pct: pTasks.length ? Math.round((done / pTasks.length) * 100) : 0,
      hours: timeEntries.filter((e) => e.projectId === p.id).reduce((s, e) => s + e.hours, 0),
    };
  });

  // Tasks-by-status bar chart data.
  const maxStatus = Math.max(...statusCounts.map((s) => s.count), 1);
  const STATUS_BAR: Record<string, string> = {
    TODO: "bg-slate-400",
    IN_PROGRESS: "bg-blue-500",
    REVIEW: "bg-amber-500",
    DONE: "bg-green-500",
  };

  // Time trend — hours logged per day over the last 14 days (team-wide for
  // managers, otherwise just the current user's own time).
  const trendEntries = teamWide ? timeEntries : timeEntries.filter((e) => e.userId === user.id);
  const trend = Array.from({ length: 14 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (13 - i));
    day.setHours(0, 0, 0, 0);
    const next = new Date(day.getTime() + 86400000);
    const hours = trendEntries
      .filter((e) => new Date(e.date) >= day && new Date(e.date) < next)
      .reduce((s, e) => s + e.hours, 0);
    return { day, hours, isToday: i === 13 };
  });
  const trendPeak = Math.max(...trend.map((d) => d.hours), 1 / 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-slate-500">
            Task and time overview{teamWide ? " across the whole team" : " for your work"} (time:
            last 30 days).
          </p>
        </div>
        {teamWide && (
          <div className="flex gap-2">
            <a href="/api/export/tasks" className="btn-secondary !py-1.5 text-xs">
              ⇩ Export tasks (CSV)
            </a>
            <a href="/api/export/timesheet?days=30" className="btn-secondary !py-1.5 text-xs">
              ⇩ Export timesheet (CSV)
            </a>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <div className="card p-4">
          <div className="text-2xl font-bold">{totalTasks}</div>
          <div className="text-xs text-slate-500">Total tasks</div>
        </div>
        {statusCounts.map((s) => (
          <div key={s.value} className="card p-4">
            <div className="text-2xl font-bold">{s.count}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
        <div className="card p-4">
          <div className="text-2xl font-bold text-red-600">{overdue}</div>
          <div className="text-xs text-slate-500">Overdue</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 font-semibold">Tasks by status</h2>
          <div className="space-y-3">
            {statusCounts.map((s) => (
              <div key={s.value} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-slate-500">{s.label}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                  <div
                    className={`h-full rounded ${STATUS_BAR[s.value] ?? "bg-slate-400"}`}
                    style={{ width: `${Math.round((s.count / maxStatus) * 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-sm font-medium">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-semibold">Time logged</h2>
            <span className="text-xs text-slate-400">Last 14 days{teamWide ? " · team" : ""}</span>
          </div>
          <div className="flex h-32 items-end gap-1.5">
            {trend.map((d, i) => {
              const pct = d.hours > 0 ? Math.max(6, Math.round((d.hours / trendPeak) * 100)) : 0;
              return (
                <div key={i} className="flex flex-1 flex-col items-center gap-1" title={fmtHours(d.hours)}>
                  <div className="flex h-24 w-full items-end rounded bg-slate-100">
                    <div
                      className={`w-full rounded ${d.isToday ? "bg-sky-500" : "bg-sky-300"}`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span className={`text-[9px] ${d.isToday ? "font-semibold text-sky-600" : "text-slate-400"}`}>
                    {d.day.getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold">{teamWide ? "By employee" : "Your summary"}</h2>
        </div>
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Employee</th>
              <th className="th">Company</th>
              <th className="th">Department</th>
              <th className="th">Open</th>
              <th className="th">Done</th>
              <th className="th">Overdue</th>
              <th className="th">Hours (30d)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {perUser.map((r) => (
              <tr key={r.user.id} className="hover:bg-slate-50">
                <td className="td font-medium">{r.user.name}</td>
                <td className="td text-slate-600">{r.user.company.code}</td>
                <td className="td text-slate-600">{r.user.department?.name ?? "—"}</td>
                <td className="td">{r.open}</td>
                <td className="td text-green-700">{r.done}</td>
                <td className={`td ${r.overdue ? "font-semibold text-red-600" : ""}`}>
                  {r.overdue}
                </td>
                <td className="td">{fmtHours(r.hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold">By project</h2>
        </div>
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Project</th>
              <th className="th">Company</th>
              <th className="th">Tasks</th>
              <th className="th">Done</th>
              <th className="th">Progress</th>
              <th className="th">Hours (30d)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {perProject.length === 0 && (
              <tr>
                <td colSpan={6} className="td py-8 text-center text-slate-400">
                  No projects yet.
                </td>
              </tr>
            )}
            {perProject.map((r) => (
              <tr key={r.project.id} className="hover:bg-slate-50">
                <td className="td font-medium">{r.project.name}</td>
                <td className="td text-slate-600">{r.project.company.code}</td>
                <td className="td">{r.total}</td>
                <td className="td text-green-700">{r.done}</td>
                <td className="td">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${r.pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">{r.pct}%</span>
                  </div>
                </td>
                <td className="td">{fmtHours(r.hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
