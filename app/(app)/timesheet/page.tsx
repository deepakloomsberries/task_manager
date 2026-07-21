import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createTimeEntry, deleteTimeEntry } from "@/lib/actions/time";
import { fmtDate, toInputDate } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function TimesheetPage() {
  const user = await requireUser();

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [entries, tasks, projects] = await Promise.all([
    db.timeEntry.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: "desc" },
      include: { task: true, project: true },
    }),
    db.task.findMany({
      where: { assigneeId: user.id, status: { not: "DONE" } },
      orderBy: { title: "asc" },
    }),
    db.project.findMany({
      where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekHours = entries
    .filter((e) => new Date(e.date) >= weekStart)
    .reduce((s, e) => s + e.hours, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Time sheet</h1>
          <p className="text-sm text-slate-500">Log the hours you spend on tasks and projects.</p>
        </div>
        <div className="flex gap-6 text-right">
          <div>
            <div className="text-2xl font-bold text-sky-600">{weekHours.toFixed(1)}h</div>
            <div className="text-xs text-slate-500">This week</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{totalHours.toFixed(1)}h</div>
            <div className="text-xs text-slate-500">Last 30 days</div>
          </div>
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
              type="number"
              step="0.25"
              min="0.25"
              max="24"
              required
              className="input"
              placeholder="e.g. 2.5"
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
                <td className="td font-medium">{e.hours}h</td>
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
