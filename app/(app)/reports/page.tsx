import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { TASK_STATUSES, fmtHours } from "@/lib/ui";
import SearchSelect from "@/components/SearchSelect";

export const dynamic = "force-dynamic";

const DAY_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { company?: string; department?: string; assignee?: string; days?: string };
}) {
  const user = await requireUser();
  const teamWide = isManagerOrAdmin(user.role);

  const days = [7, 30, 90, 365].includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Only managers/admins can slice by company, department or person; everyone
  // else sees just their own work.
  const companyId = teamWide && searchParams.company ? Number(searchParams.company) : null;
  const departmentId = teamWide && searchParams.department ? Number(searchParams.department) : null;
  const assigneeId = teamWide && searchParams.assignee ? Number(searchParams.assignee) : null;
  const filtersActive = !!(companyId || departmentId || assigneeId);

  const [allUsers, companies, departments, tasks, timeEntries, projects] = await Promise.all([
    db.user.findMany({
      where: { active: true },
      include: { company: true, department: true },
      orderBy: { name: "asc" },
    }),
    db.company.findMany({ orderBy: { code: "asc" } }),
    db.department.findMany({ include: { company: true }, orderBy: { name: "asc" } }),
    db.task.findMany({ where: { deletedAt: null }, include: { project: true } }),
    db.timeEntry.findMany({ where: { date: { gte: since } } }),
    db.project.findMany({
      include: { company: true, _count: { select: { tasks: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  // The set of people this report is scoped to.
  const scopedUsers = (teamWide ? allUsers : allUsers.filter((u) => u.id === user.id)).filter((u) => {
    if (companyId && u.companyId !== companyId) return false;
    if (departmentId && u.departmentId !== departmentId) return false;
    if (assigneeId && u.id !== assigneeId) return false;
    return true;
  });
  const scopedUserIds = new Set(scopedUsers.map((u) => u.id));

  // When a person/company/department filter is on (or for a non-manager), the
  // task & time figures cover only tasks assigned to the scoped people.
  const restrictTasks = !teamWide || filtersActive;
  const scopedTasks = restrictTasks
    ? tasks.filter((t) => t.assigneeId != null && scopedUserIds.has(t.assigneeId))
    : tasks;
  const scopedEntries = restrictTasks
    ? timeEntries.filter((e) => scopedUserIds.has(e.userId))
    : timeEntries;
  const scopedProjects = companyId ? projects.filter((p) => p.companyId === companyId) : projects;

  const statusCounts = TASK_STATUSES.map((s) => ({
    ...s,
    count: scopedTasks.filter((t) => t.status === s.value).length,
  }));
  const totalTasks = scopedTasks.length;
  const overdue = scopedTasks.filter(
    (t) => t.dueDate && t.status !== "DONE" && new Date(t.dueDate) < new Date()
  ).length;

  const perUser = scopedUsers.map((u) => {
    const uTasks = scopedTasks.filter((t) => t.assigneeId === u.id);
    const uHours = scopedEntries.filter((e) => e.userId === u.id).reduce((s, e) => s + e.hours, 0);
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

  const perProject = scopedProjects.map((p) => {
    const pTasks = scopedTasks.filter((t) => t.projectId === p.id);
    const done = pTasks.filter((t) => t.status === "DONE").length;
    return {
      project: p,
      total: pTasks.length,
      done,
      pct: pTasks.length ? Math.round((done / pTasks.length) * 100) : 0,
      hours: scopedEntries.filter((e) => e.projectId === p.id).reduce((s, e) => s + e.hours, 0),
    };
  });

  const maxStatus = Math.max(...statusCounts.map((s) => s.count), 1);
  const STATUS_BAR: Record<string, string> = {
    TODO: "bg-slate-400",
    IN_PROGRESS: "bg-blue-500",
    REVIEW: "bg-amber-500",
    DONE: "bg-green-500",
  };

  // Time trend — hours logged per day over the last 14 days, within the scope.
  const trend = Array.from({ length: 14 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (13 - i));
    day.setHours(0, 0, 0, 0);
    const next = new Date(day.getTime() + 86400000);
    const hours = scopedEntries
      .filter((e) => new Date(e.date) >= day && new Date(e.date) < next)
      .reduce((s, e) => s + e.hours, 0);
    return { day, hours, isToday: i === 13 };
  });
  const trendPeak = Math.max(...trend.map((d) => d.hours), 1 / 6);

  const daysLabel = DAY_OPTIONS.find((d) => d.value === String(days))?.label ?? `Last ${days} days`;
  const exportDays = days;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-slate-500">
            Task and time overview{filtersActive ? " (filtered)" : teamWide ? " across the whole team" : " for your work"} · time: {daysLabel.toLowerCase()}.
          </p>
        </div>
        {teamWide && (
          <div className="flex gap-2">
            <a href="/api/export/tasks" className="btn-secondary !py-1.5 text-xs">
              ⇩ Export tasks (CSV)
            </a>
            <a href={`/api/export/timesheet?days=${exportDays}`} className="btn-secondary !py-1.5 text-xs">
              ⇩ Export timesheet (CSV)
            </a>
          </div>
        )}
      </div>

      {teamWide && (
        <form className="card flex flex-wrap items-end gap-3 p-4" method="GET">
          <div>
            <label className="label">Employee</label>
            <SearchSelect
              name="assignee"
              defaultValue={searchParams.assignee ?? ""}
              className="w-48"
              placeholder="Everyone"
              searchPlaceholder="Search people…"
              options={[{ value: "", label: "Everyone" }, ...allUsers.map((u) => ({ value: String(u.id), label: u.name }))]}
            />
          </div>
          <div>
            <label className="label">Company</label>
            <select name="company" defaultValue={searchParams.company ?? ""} className="input">
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Department</label>
            <select name="department" defaultValue={searchParams.department ?? ""} className="input">
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.company.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Time window</label>
            <select name="days" defaultValue={String(days)} className="input">
              {DAY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary">
            Apply
          </button>
          {(filtersActive || days !== 30) && (
            <a href="/reports" className="btn-secondary" title="Reset filters">
              Clear
            </a>
          )}
        </form>
      )}

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
            <span className="text-xs text-slate-400">Last 14 days{filtersActive ? " · filtered" : teamWide ? " · team" : ""}</span>
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
              <th className="th">Hours ({days}d)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {perUser.length === 0 && (
              <tr>
                <td colSpan={7} className="td py-8 text-center text-slate-400">
                  No people match these filters.
                </td>
              </tr>
            )}
            {perUser.map((r) => (
              <tr key={r.user.id} className="hover:bg-slate-50">
                <td className="td font-medium">{r.user.name}</td>
                <td className="td text-slate-600">{r.user.company.code}</td>
                <td className="td text-slate-600">{r.user.department?.name ?? "—"}</td>
                <td className="td">{r.open}</td>
                <td className="td text-green-700">{r.done}</td>
                <td className={`td ${r.overdue ? "font-semibold text-red-600" : ""}`}>{r.overdue}</td>
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
              <th className="th">Hours ({days}d)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {perProject.length === 0 && (
              <tr>
                <td colSpan={6} className="td py-8 text-center text-slate-400">
                  No projects match these filters.
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
                      <div className="h-full rounded-full bg-sky-500" style={{ width: `${r.pct}%` }} />
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
