import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import {
  updateProject,
  addProjectMember,
  removeProjectMember,
  deleteProject,
} from "@/lib/actions/projects";
import { saveProjectAsTemplate } from "@/lib/actions/templates";
import UserAvatar from "@/components/UserAvatar";
import ProjectTimeline from "@/components/ProjectTimeline";
import {
  PROJECT_STATUSES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  lookup,
  fmtDate,
  fmtHours,
  isOverdue,
  initials,
  avatarColor,
} from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { edit?: string };
}) {
  const user = await requireUser();
  const id = Number(params.id);
  if (!id) notFound();

  const [project, allUsers] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: {
        company: true,
        createdBy: true,
        members: { include: { user: true } },
        tasks: {
          where: { deletedAt: null },
          include: { assignee: true },
          orderBy: [{ status: "asc" }, { dueDate: "asc" }],
        },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!project) notFound();

  // Roll up all time logged against this project — either tagged to the project
  // directly or logged on one of its tasks.
  const taskIds = project.tasks.map((t) => t.id);
  const timeEntries = await db.timeEntry.findMany({
    where: {
      OR: [{ projectId: id }, ...(taskIds.length ? [{ taskId: { in: taskIds } }] : [])],
    },
    include: { user: { select: { id: true, name: true, avatarPath: true } } },
  });
  const timeByUser = new Map<number, { user: { id: number; name: string; avatarPath: string | null }; hours: number }>();
  let projectHours = 0;
  for (const e of timeEntries) {
    projectHours += e.hours;
    const cur = timeByUser.get(e.userId) ?? { user: e.user, hours: 0 };
    cur.hours += e.hours;
    timeByUser.set(e.userId, cur);
  }
  const timeRows = Array.from(timeByUser.values()).sort((a, b) => b.hours - a.hours);

  // Blocker edges for the timeline (which task waits on which).
  const deps = taskIds.length
    ? await db.taskDependency.findMany({
        where: { taskId: { in: taskIds } },
        include: { blocker: { select: { title: true, status: true } } },
      })
    : [];
  const blockersByTask: Record<number, { title: string; status: string }[]> = {};
  for (const d of deps) {
    (blockersByTask[d.taskId] ??= []).push(d.blocker);
  }

  const canManage = isManagerOrAdmin(user.role);
  const editing = searchParams.edit === "1" && canManage;
  const status = lookup(PROJECT_STATUSES, project.status);
  const memberIds = new Set(project.members.map((m) => m.userId));
  const nonMembers = allUsers.filter((u) => !memberIds.has(u.id));
  const done = project.tasks.filter((t) => t.status === "DONE").length;
  const pct = project.tasks.length ? Math.round((done / project.tasks.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <Link href="/projects" className="text-sm text-slate-500 hover:underline">
        ← Back to projects
      </Link>

      <div className="card p-6">
        {!editing ? (
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold">{project.name}</h1>
                <span className={`badge ${status.badge}`}>{status.label}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {project.description || "No description"}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {project.company.name} · Created by {project.createdBy.name} on{" "}
                {fmtDate(project.createdAt)}
              </p>
            </div>
            {canManage && (
              <div className="flex shrink-0 gap-2">
                <form action={saveProjectAsTemplate}>
                  <input type="hidden" name="projectId" value={project.id} />
                  <button type="submit" className="btn-secondary" title="Copy this project's tasks into a reusable template">
                    Save as template
                  </button>
                </form>
                <Link href={`/projects/${project.id}?edit=1`} className="btn-secondary">
                  Edit
                </Link>
                {user.role === "ADMIN" && (
                  <form action={deleteProject}>
                    <input type="hidden" name="id" value={project.id} />
                    <button type="submit" className="btn-danger">
                      Delete
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        ) : (
          <form action={updateProject} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="id" value={project.id} />
            <div>
              <label className="label">Name *</label>
              <input name="name" required defaultValue={project.name} className="input" />
            </div>
            <div>
              <label className="label">Status</label>
              <select name="status" defaultValue={project.status} className="input">
                {PROJECT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <textarea
                name="description"
                rows={2}
                defaultValue={project.description ?? ""}
                className="input"
              />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <button type="submit" className="btn-primary">
                Save
              </button>
              <Link href={`/projects/${project.id}`} className="btn-secondary">
                Cancel
              </Link>
            </div>
          </form>
        )}

        <div className="mt-5">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>
              {done}/{project.tasks.length} tasks done
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Tasks</h2>
            <Link href={`/tasks?new=1`} className="text-sm text-sky-600 hover:underline">
              + Add task
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {project.tasks.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-slate-400">No tasks in this project.</p>
            )}
            {project.tasks.map((t) => {
              const ts = lookup(TASK_STATUSES, t.status);
              const tp = lookup(TASK_PRIORITIES, t.priority);
              return (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.title}</div>
                    <div className="text-xs text-slate-500">{t.assignee?.name ?? "Unassigned"}</div>
                  </div>
                  <span className={`badge ${tp.badge}`}>{tp.label}</span>
                  <span className={`badge ${ts.badge}`}>{ts.label}</span>
                  <span
                    className={`w-24 text-right text-xs ${
                      isOverdue(t) ? "font-semibold text-red-600" : "text-slate-500"
                    }`}
                  >
                    {fmtDate(t.dueDate)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Members ({project.members.length})</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {project.members.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 px-5 py-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor(m.user.name)}`}
                >
                  {initials(m.user.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.user.name}</div>
                  <div className="text-xs text-slate-500">{m.user.jobTitle ?? m.user.email}</div>
                </div>
                {canManage && (
                  <form action={removeProjectMember}>
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <button
                      type="submit"
                      className="text-xs text-slate-400 hover:text-red-600"
                      title="Remove member"
                    >
                      ✕
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
          {canManage && nonMembers.length > 0 && (
            <form action={addProjectMember} className="flex gap-2 border-t border-slate-200 p-4">
              <input type="hidden" name="projectId" value={project.id} />
              <select name="userId" className="input flex-1">
                {nonMembers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-secondary">
                Add
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 font-semibold">Timeline</h2>
        <ProjectTimeline
          tasks={project.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            createdAt: t.createdAt,
            dueDate: t.dueDate,
          }))}
          blockersByTask={blockersByTask}
          projectStart={project.createdAt}
        />
      </div>

      <div className="card p-6">
        <h2 className="mb-4 flex items-baseline justify-between font-semibold">
          <span>Time logged</span>
          <span className="text-sm font-normal text-slate-400">{fmtHours(projectHours)} total</span>
        </h2>
        {timeRows.length === 0 ? (
          <p className="text-sm text-slate-400">No time logged on this project yet.</p>
        ) : (
          <div className="space-y-3">
            {timeRows.map((r) => {
              const pct = projectHours > 0 ? Math.round((r.hours / projectHours) * 100) : 0;
              return (
                <div key={r.user.id} className="flex items-center gap-3">
                  <UserAvatar user={r.user} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{r.user.name}</span>
                      <span className="shrink-0 text-slate-500">
                        {fmtHours(r.hours)} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
