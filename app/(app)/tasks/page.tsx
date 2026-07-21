import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createTask } from "@/lib/actions/tasks";
import { TASK_STATUSES, TASK_PRIORITIES, lookup, fmtDate, isOverdue } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { status?: string; assignee?: string; project?: string; q?: string; new?: string };
}) {
  const user = await requireUser();

  const where: Record<string, unknown> = {};
  if (searchParams.status) where.status = searchParams.status;
  if (searchParams.assignee === "me") where.assigneeId = user.id;
  else if (searchParams.assignee) where.assigneeId = Number(searchParams.assignee);
  if (searchParams.project) where.projectId = Number(searchParams.project);
  if (searchParams.q) where.title = { contains: searchParams.q };

  const [tasks, users, projects] = await Promise.all([
    db.task.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      include: { project: true, assignee: true },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.project.findMany({
      where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
      orderBy: { name: "asc" },
    }),
  ]);

  const showNew = searchParams.new === "1";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <Link href={showNew ? "/tasks" : "/tasks?new=1"} className="btn-primary">
          {showNew ? "Close" : "+ New Task"}
        </Link>
      </div>

      {showNew && (
        <div className="card p-5">
          <h2 className="mb-4 font-semibold">Create task</h2>
          <form action={createTask} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">Title *</label>
              <input name="title" required className="input" placeholder="What needs to be done?" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <textarea name="description" rows={3} className="input" />
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
              <label className="label">Assignee</label>
              <select name="assigneeId" className="input" defaultValue={user.id}>
                <option value="">— Unassigned —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select name="priority" className="input" defaultValue="MEDIUM">
                {TASK_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Due date</label>
              <input name="dueDate" type="date" className="input" />
            </div>
            <div className="md:col-span-2">
              <button type="submit" className="btn-primary">
                Create task
              </button>
            </div>
          </form>
        </div>
      )}

      <form className="card flex flex-wrap items-end gap-3 p-4" method="GET">
        <div className="w-48">
          <label className="label">Search</label>
          <input name="q" defaultValue={searchParams.q ?? ""} className="input" placeholder="Task title…" />
        </div>
        <div>
          <label className="label">Status</label>
          <select name="status" defaultValue={searchParams.status ?? ""} className="input">
            <option value="">All</option>
            {TASK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Assignee</label>
          <select name="assignee" defaultValue={searchParams.assignee ?? ""} className="input">
            <option value="">Everyone</option>
            <option value="me">My tasks</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Project</label>
          <select name="project" defaultValue={searchParams.project ?? ""} className="input">
            <option value="">All</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">
          Filter
        </button>
        <Link href="/tasks" className="text-sm text-slate-500 hover:underline">
          Clear
        </Link>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Task</th>
              <th className="th">Project</th>
              <th className="th">Assignee</th>
              <th className="th">Priority</th>
              <th className="th">Status</th>
              <th className="th">Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.length === 0 && (
              <tr>
                <td colSpan={6} className="td py-10 text-center text-slate-400">
                  No tasks match your filters.
                </td>
              </tr>
            )}
            {tasks.map((t) => {
              const status = lookup(TASK_STATUSES, t.status);
              const priority = lookup(TASK_PRIORITIES, t.priority);
              return (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link href={`/tasks/${t.id}`} className="font-medium text-sky-700 hover:underline">
                      {t.title}
                    </Link>
                  </td>
                  <td className="td text-slate-600">{t.project?.name ?? "—"}</td>
                  <td className="td text-slate-600">{t.assignee?.name ?? "—"}</td>
                  <td className="td">
                    <span className={`badge ${priority.badge}`}>{priority.label}</span>
                  </td>
                  <td className="td">
                    <span className={`badge ${status.badge}`}>{status.label}</span>
                  </td>
                  <td
                    className={`td ${
                      isOverdue(t) ? "font-semibold text-red-600" : "text-slate-600"
                    }`}
                  >
                    {fmtDate(t.dueDate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
