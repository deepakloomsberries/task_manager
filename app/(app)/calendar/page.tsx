import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { TASK_PRIORITIES, TASK_STATUSES, lookup } from "@/lib/ui";
import CalendarGrid, { type CalTask } from "@/components/CalendarGrid";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: {
    m?: string;
    scope?: string;
    assignee?: string;
    project?: string;
    status?: string;
    priority?: string;
  };
}) {
  const user = await requireUser();
  const isManager = isManagerOrAdmin(user.role);

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  const match = searchParams.m?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]) - 1;
  }

  const assigneeId = searchParams.assignee ? Number(searchParams.assignee) : null;
  const projectId = searchParams.project ? Number(searchParams.project) : null;
  const status = searchParams.status && TASK_STATUSES.some((s) => s.value === searchParams.status)
    ? searchParams.status
    : null;
  const priority = searchParams.priority && TASK_PRIORITIES.some((p) => p.value === searchParams.priority)
    ? searchParams.priority
    : null;

  // A specific assignee filter implies looking beyond your own tasks.
  const mine = searchParams.scope !== "all" && !assigneeId;
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);

  const [tasks, users, projects] = await Promise.all([
    db.task.findMany({
      where: {
        dueDate: { gte: monthStart, lt: monthEnd },
        deletedAt: null,
        ...(assigneeId ? { assigneeId } : mine ? { assigneeId: user.id } : {}),
        ...(projectId ? { projectId } : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
      },
      include: { assignee: true },
      orderBy: { priority: "desc" },
    }),
    isManager
      ? db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    db.project.findMany({
      where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const calTasks: CalTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    badge: lookup(TASK_PRIORITIES, t.priority).badge,
    assigneeName: t.assignee?.name ?? null,
    day: new Date(t.dueDate!).getDate(),
    editable: isManager || t.assigneeId === user.id || t.createdById === user.id,
  }));

  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const todayDay = year === now.getFullYear() && month === now.getMonth() ? now.getDate() : null;

  // Preserve scope + filters across month navigation and the scope toggle.
  const buildQuery = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (!mine) p.set("scope", "all");
    if (assigneeId) p.set("assignee", String(assigneeId));
    if (projectId) p.set("project", String(projectId));
    if (status) p.set("status", status);
    if (priority) p.set("priority", priority);
    p.set("m", fmt(monthStart));
    for (const [k, v] of Object.entries(over)) {
      if (v === undefined) p.delete(k);
      else p.set(k, v);
    }
    return `/calendar?${p.toString()}`;
  };

  const filtersActive = !!(assigneeId || projectId || status || priority);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-slate-500">Tasks by due date · drag a task to reschedule it.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
            <Link
              href={buildQuery({ scope: undefined, assignee: undefined })}
              className={`rounded-md px-3 py-1 ${mine ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              My tasks
            </Link>
            <Link
              href={buildQuery({ scope: "all" })}
              className={`rounded-md px-3 py-1 ${!mine ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              Everyone
            </Link>
          </div>
          <Link href={buildQuery({ m: fmt(prev) })} className="btn-secondary !px-3">
            ←
          </Link>
          <span className="w-40 text-center font-semibold">
            {MONTHS[month]} {year}
          </span>
          <Link href={buildQuery({ m: fmt(next) })} className="btn-secondary !px-3">
            →
          </Link>
        </div>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4" method="GET">
        <input type="hidden" name="m" value={fmt(monthStart)} />
        {!mine && <input type="hidden" name="scope" value="all" />}
        {isManager && (
          <div>
            <label className="label">Assignee</label>
            <select name="assignee" defaultValue={searchParams.assignee ?? ""} className="input">
              <option value="">Everyone</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label">Project</label>
          <select name="project" defaultValue={searchParams.project ?? ""} className="input">
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select name="status" defaultValue={searchParams.status ?? ""} className="input">
            <option value="">Any status</option>
            {TASK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Priority</label>
          <select name="priority" defaultValue={searchParams.priority ?? ""} className="input">
            <option value="">Any priority</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary">
          Apply
        </button>
        {filtersActive && (
          <Link href={`/calendar?m=${fmt(monthStart)}${mine ? "" : "&scope=all"}`} className="btn-secondary">
            Clear
          </Link>
        )}
      </form>

      <CalendarGrid year={year} month={month} todayDay={todayDay} tasks={calTasks} />
    </div>
  );
}
