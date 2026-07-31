import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import UserAvatar from "@/components/UserAvatar";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  lookup,
  fmtDate,
  isOverdue,
  ONLINE_WINDOW_MS,
} from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { show?: string };
}) {
  const user = await requireUser();

  const showAllRecent = searchParams.show === "all";
  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);

  const [
    myOpen,
    myOverdue,
    myDueThisWeek,
    myDoneThisMonth,
    recentTasks,
    activeProjects,
    activeUsers,
  ] = await Promise.all([
      db.task.count({ where: { assigneeId: user.id, status: { not: "DONE" }, deletedAt: null } }),
      db.task.count({
        where: {
          assigneeId: user.id,
          status: { not: "DONE" },
          deletedAt: null,
          dueDate: { lt: new Date() },
        },
      }),
      db.task.count({
        where: {
          assigneeId: user.id,
          status: { not: "DONE" },
          deletedAt: null,
          dueDate: {
            gte: new Date(),
            lt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      db.task.count({
        where: {
          assigneeId: user.id,
          status: "DONE",
          deletedAt: null,
          completedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
      db.task.findMany({
        where: {
          deletedAt: null,
          ...(showAllRecent ? {} : { status: { not: "DONE" } }),
          OR: [{ assigneeId: user.id }, { createdById: user.id }],
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
        include: { project: true, assignee: true },
      }),
      db.project.findMany({
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { company: true, _count: { select: { tasks: true } } },
      }),
      db.user.findMany({
        where: { active: true, id: { not: user.id }, lastSeenAt: { gte: onlineSince } },
        orderBy: { lastSeenAt: "desc" },
        take: 12,
        select: { id: true, name: true, jobTitle: true, avatarPath: true, lastSeenAt: true },
      }),
    ]);

  const stats = [
    { label: "My open tasks", value: myOpen, color: "text-sky-600", href: "/tasks?assignee=me&open=1" },
    { label: "Overdue", value: myOverdue, color: "text-red-600", href: "/tasks?assignee=me&overdue=1" },
    { label: "Due in 7 days", value: myDueThisWeek, color: "text-amber-600", href: "/tasks?assignee=me&due=week" },
    { label: "Completed this month", value: myDoneThisMonth, color: "text-green-600", href: "/tasks?assignee=me&status=DONE" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, {user.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-slate-500">
            Here is what is happening with your work.
          </p>
        </div>
        <Link href="/tasks?new=1" className="btn-primary">
          + New Task
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="card p-5 transition-shadow hover:shadow-md hover:ring-1 hover:ring-sky-200 dark:hover:ring-sky-900"
          >
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
            <div className="mt-1 text-sm text-slate-500">{s.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold">Recent tasks</h2>
            <div className="flex items-center gap-4 text-sm">
              <Link
                href={showAllRecent ? "/dashboard" : "/dashboard?show=all"}
                className="text-slate-500 hover:text-sky-600 hover:underline"
              >
                {showAllRecent ? "Active only" : "Show completed"}
              </Link>
              <Link href="/tasks" className="text-sky-600 hover:underline">
                View all
              </Link>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {recentTasks.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-slate-400">
                {showAllRecent
                  ? "No tasks yet. Create your first task to get started."
                  : "No active tasks — nice, you're all caught up!"}
              </p>
            )}
            {recentTasks.map((t) => {
              const status = lookup(TASK_STATUSES, t.status);
              const priority = lookup(TASK_PRIORITIES, t.priority);
              return (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.title}</div>
                    <div className="text-xs text-slate-500">
                      {t.project?.name ?? "No project"} ·{" "}
                      {t.assignee ? `Assigned to ${t.assignee.name}` : "Unassigned"}
                    </div>
                  </div>
                  <span className={`badge ${priority.badge}`}>{priority.label}</span>
                  <span className={`badge ${status.badge}`}>{status.label}</span>
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

        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Active now
                <span className="text-sm font-normal text-slate-400">({activeUsers.length})</span>
              </h2>
              <Link href="/messages" className="text-sm text-sky-600 hover:underline">
                Message
              </Link>
            </div>
            <div className="p-4">
              {activeUsers.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">No one else is online right now.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {activeUsers.map((u) => (
                    <Link
                      key={u.id}
                      href={`/messages/${u.id}`}
                      title={`Message ${u.name}${u.jobTitle ? ` · ${u.jobTitle}` : ""}`}
                      className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/50"
                    >
                      <UserAvatar user={u} size={30} presence={u.lastSeenAt} />
                      <span className="text-sm">{u.name.split(" ")[0]}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold">Active projects</h2>
              <Link href="/projects" className="text-sm text-sky-600 hover:underline">
                View all
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {activeProjects.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-slate-400">No active projects.</p>
              )}
              {activeProjects.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="block px-5 py-3 hover:bg-slate-50"
                >
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    {p.company.name} · {p._count.tasks} tasks
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
