import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import UserAvatar from "@/components/UserAvatar";
import { LiveWorkingCard } from "@/components/ActiveTimers";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  lookup,
  fmtDate,
  fmtHours,
  lastSeenLabel,
  isOverdue,
} from "@/lib/ui";
import { weekStartOf } from "@/lib/timerange";

export const dynamic = "force-dynamic";

const ROLE_BADGE: Record<string, string> = {
  ADMIN: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
  MANAGER: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  EMPLOYEE: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};
const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", MANAGER: "Manager", EMPLOYEE: "Employee" };

export default async function PersonProfilePage({ params }: { params: { id: string } }) {
  const viewer = await requireUser();
  const id = Number(params.id);
  if (!id) notFound();

  const person = await db.user.findUnique({
    where: { id },
    include: { company: true, department: true, activeTimer: { include: { task: true } } },
  });
  if (!person) notFound();

  const isSelf = person.id === viewer.id;
  const now = new Date();
  const weekStart = weekStartOf(now);

  // Tasks this person owns or collaborates on.
  const mineScope = {
    deletedAt: null,
    OR: [{ assigneeId: person.id }, { collaborators: { some: { userId: person.id } } }],
  };

  const [openTasks, doneRecent, openCount, doneCount, overdueCount, doneAll, hoursAgg, projectRows] =
    await Promise.all([
      db.task.findMany({
        where: { ...mineScope, status: { not: "DONE" } },
        orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
        include: { project: true, blockedBy: { include: { blocker: { select: { status: true } } } } },
        take: 12,
      }),
      db.task.findMany({
        where: { ...mineScope, status: "DONE" },
        orderBy: { completedAt: "desc" },
        include: { project: true },
        take: 8,
      }),
      db.task.count({ where: { ...mineScope, status: { not: "DONE" } } }),
      db.task.count({ where: { ...mineScope, status: "DONE" } }),
      db.task.count({ where: { ...mineScope, status: { not: "DONE" }, dueDate: { lt: now } } }),
      // Completed tasks with dates, for on-time %, cycle time, throughput.
      db.task.findMany({
        where: { ...mineScope, status: "DONE", completedAt: { not: null } },
        select: { completedAt: true, dueDate: true, createdAt: true },
      }),
      db.timeEntry.aggregate({
        _sum: { hours: true },
        where: { userId: person.id, date: { gte: weekStart } },
      }),
      // Projects this person has tasks in.
      db.task.findMany({
        where: { ...mineScope, projectId: { not: null } },
        select: { project: { select: { id: true, name: true } } },
        distinct: ["projectId"],
        take: 24,
      }),
    ]);

  const withDue = doneAll.filter((t) => t.dueDate);
  const onTimeCount = withDue.filter((t) => new Date(t.completedAt!) <= new Date(t.dueDate!)).length;
  const onTimePct = withDue.length ? Math.round((onTimeCount / withDue.length) * 100) : null;
  const doneThisWeek = doneAll.filter((t) => t.completedAt && new Date(t.completedAt) >= weekStart).length;
  const hoursThisWeek = hoursAgg._sum.hours ?? 0;

  // Average cycle time (created → completed), in days. Clamp per-task to ≥0 so
  // any out-of-order timestamps can't produce a negative average.
  const avgCycleDays = doneAll.length
    ? doneAll.reduce(
        (s, t) => s + Math.max(0, new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()),
        0
      ) /
      doneAll.length /
      86_400_000
    : null;

  // Completed per week over the last 8 weeks (Sunday-based buckets).
  const throughput = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(weekStart);
    start.setDate(weekStart.getDate() - (7 - i) * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const count = doneAll.filter(
      (t) => t.completedAt && new Date(t.completedAt) >= start && new Date(t.completedAt) < end
    ).length;
    return { start, count };
  });
  const tpPeak = Math.max(...throughput.map((w) => w.count), 1);

  const projects = projectRows.map((r) => r.project).filter((p): p is { id: number; name: string } => !!p);

  const stats: { label: string; value: string; accent?: string; sub?: string }[] = [
    {
      label: "Open tasks",
      value: String(openCount),
      sub: overdueCount > 0 ? `${overdueCount} overdue` : undefined,
    },
    { label: "Completed", value: String(doneCount) },
    { label: "Done this week", value: String(doneThisWeek), accent: "text-green-600" },
    { label: "On-time", value: onTimePct === null ? "—" : `${onTimePct}%`, accent: "text-sky-600" },
    {
      label: "Avg cycle",
      value: avgCycleDays === null ? "—" : `${avgCycleDays < 10 ? avgCycleDays.toFixed(1) : Math.round(avgCycleDays)}d`,
    },
    { label: "Logged this week", value: fmtHours(hoursThisWeek) },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
        ← Back to dashboard
      </Link>

      {/* Header */}
      <div className="card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <UserAvatar user={person} size={72} presence={person.lastSeenAt} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{person.name}</h1>
              <span className={`badge ${ROLE_BADGE[person.role] ?? ROLE_BADGE.EMPLOYEE}`}>
                {ROLE_LABEL[person.role] ?? person.role}
              </span>
              {!person.active && <span className="badge bg-red-100 text-red-700">Deactivated</span>}
            </div>
            {person.jobTitle && <div className="text-sm text-slate-600 dark:text-slate-300">{person.jobTitle}</div>}
            <div className="mt-0.5 text-sm text-slate-500">
              {person.company.name}
              {person.department ? ` · ${person.department.name}` : ""}
            </div>
            <div className="mt-1 text-xs text-slate-400">{lastSeenLabel(person.lastSeenAt)}</div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <a href={`mailto:${person.email}`} className="btn-secondary text-sm">
              ✉ Email
            </a>
            {!isSelf && (
              <Link href={`/messages/${person.id}`} className="btn-primary text-sm">
                Message
              </Link>
            )}
            {isSelf && (
              <Link href="/settings" className="btn-secondary text-sm">
                Edit profile
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="card p-4 text-center">
            <div className={`text-2xl font-bold ${s.accent ?? ""}`}>{s.value}</div>
            <div className="mt-0.5 text-xs text-slate-500">{s.label}</div>
            {s.sub && <div className="mt-0.5 text-[11px] font-medium text-red-600">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Projects they work across */}
      {projects.length > 0 && (
        <div className="card p-4">
          <div className="mb-2 text-xs font-medium text-slate-500">Projects</div>
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
              >
                {p.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Completed per week */}
      {doneCount > 0 && (
        <div className="card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <div className="text-xs font-medium text-slate-500">Completed — last 8 weeks</div>
            <div className="text-xs text-slate-400">{doneAll.length} total</div>
          </div>
          <div className="flex h-24 items-end gap-1.5">
            {throughput.map((w, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${w.count} completed`}>
                <div className="text-[10px] font-medium text-slate-500">{w.count || ""}</div>
                <div
                  className={`w-full rounded-t ${i === 7 ? "bg-sky-500" : "bg-sky-200 dark:bg-sky-900"}`}
                  style={{ height: `${Math.max(3, (w.count / tpPeak) * 72)}px` }}
                />
                <div className="text-[9px] text-slate-400">
                  {w.start.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Working on now */}
      <LiveWorkingCard
        title={isSelf ? "What you're working on now" : `What ${person.name.split(" ")[0]} is working on now`}
        initial={
          person.activeTimer && person.activeTimer.task && !person.activeTimer.task.deletedAt
            ? [
                {
                  id: person.activeTimer.id,
                  userId: person.id,
                  userName: person.name,
                  avatarPath: person.avatarPath,
                  taskId: person.activeTimer.taskId,
                  taskTitle: person.activeTimer.task.title,
                  estimateHours: person.activeTimer.task.estimateHours,
                  startedAt: person.activeTimer.startedAt.toISOString(),
                },
              ]
            : []
        }
        onlyUserId={person.id}
        showTask
      />

      {/* Open tasks */}
      <div className="card">
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 className="text-sm font-semibold">
            Open tasks <span className="text-xs font-normal text-slate-400">({openCount})</span>
          </h2>
        </div>
        {openTasks.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">No open tasks.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {openTasks.map((t) => {
              const status = lookup(TASK_STATUSES, t.status);
              const priority = lookup(TASK_PRIORITIES, t.priority);
              const blocked = t.blockedBy.some((d) => d.blocker.status !== "DONE");
              return (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.title}</div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {t.project && <span>{t.project.name}</span>}
                      {blocked && <span className="font-medium text-red-600">⛔ Blocked</span>}
                    </div>
                  </div>
                  <span className={`badge ${status.badge}`}>{status.label}</span>
                  <span className={`badge ${priority.badge}`}>{priority.label}</span>
                  <span
                    className={`w-24 text-right text-xs ${
                      isOverdue(t) ? "font-semibold text-red-600" : "text-slate-500"
                    }`}
                  >
                    {t.dueDate ? fmtDate(t.dueDate) : "—"}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Recently completed */}
      <div className="card">
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 className="text-sm font-semibold">
            Recently completed{" "}
            <span className="text-xs font-normal text-slate-400">({doneCount} total)</span>
          </h2>
        </div>
        {doneRecent.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">Nothing completed yet.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {doneRecent.map((t) => (
              <Link
                key={t.id}
                href={`/tasks/${t.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500 text-xs text-white">
                  ✓
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-slate-600 line-through dark:text-slate-300">
                    {t.title}
                  </div>
                  {t.project && <div className="text-xs text-slate-400">{t.project.name}</div>}
                </div>
                <span className="w-24 text-right text-xs text-slate-400">
                  {t.completedAt ? fmtDate(t.completedAt) : ""}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
