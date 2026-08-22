import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { setTaskStatus } from "@/lib/actions/tasks";
import { startTaskTimer, stopTaskTimer } from "@/lib/actions/time";
import UserAvatar from "@/components/UserAvatar";
import LiveElapsed from "@/components/LiveElapsed";
import LiveClock from "@/components/LiveClock";
import OfficeClocks from "@/components/OfficeClocks";
import QuickAdd from "@/components/QuickAdd";
import ReviewTasksBanner from "@/components/ReviewTasksBanner";
import AdminDashboard from "./AdminDashboard";
import { companyTimezone, zonedStartOfToday, zonedHour, zonedDateLine } from "@/lib/tz";
import {
  TASK_PRIORITIES,
  lookup,
  fmtDate,
  fmtHours,
  fmtRelative,
  ONLINE_WINDOW_MS,
} from "@/lib/ui";

export const dynamic = "force-dynamic";

const DAY = 86400000;
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function greeting(h: number) {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();

  // Admins get an org-wide command centre instead of a personal task list.
  if (user.role === "ADMIN") return <AdminDashboard user={user} />;

  const now = new Date();
  // "Today", the week and the greeting all follow the user's office time zone,
  // so a person in Dubai or Riyadh sees their own local day — not the server's.
  const tz = companyTimezone(user.company);
  const todayStart = zonedStartOfToday(now, tz);
  const tomorrow = new Date(todayStart.getTime() + DAY);
  const weekFromNow = new Date(todayStart.getTime() + 7 * DAY);
  const dow = new Date(
    // day-of-week of the local today, derived from the local calendar date
    Date.UTC(
      Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(now)),
      Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric" }).format(now)) - 1,
      Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).format(now))
    )
  ).getUTCDay();
  const localDayOfMonth = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).format(now));
  const weekStart = new Date(todayStart.getTime() - dow * DAY);
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY);
  const monthStart = new Date(todayStart.getTime() - (localDayOfMonth - 1) * DAY);
  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);

  const [openTasks, doneThisWeek, doneThisMonth, timer, weekEntries, activeProjects, activeUsers, notifications] =
    await Promise.all([
      db.task.findMany({
        where: {
          status: { not: "DONE" },
          deletedAt: null,
          OR: [{ assigneeId: user.id }, { collaborators: { some: { userId: user.id } } }],
        },
        orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
        include: { project: { select: { name: true } }, subtasks: { where: { deletedAt: null }, select: { status: true } } },
      }),
      db.task.count({ where: { assigneeId: user.id, status: "DONE", deletedAt: null, completedAt: { gte: weekStart, lt: weekEnd } } }),
      db.task.count({ where: { assigneeId: user.id, status: "DONE", deletedAt: null, completedAt: { gte: monthStart } } }),
      db.taskTimer.findUnique({ where: { userId: user.id }, include: { task: { select: { id: true, title: true } } } }),
      db.timeEntry.findMany({ where: { userId: user.id, date: { gte: weekStart, lt: weekEnd } }, select: { date: true, hours: true } }),
      db.project.findMany({
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 4,
        include: { company: true, _count: { select: { tasks: true } } },
      }),
      db.user.findMany({
        where: { active: true, id: { not: user.id }, lastSeenAt: { gte: onlineSince } },
        orderBy: { lastSeenAt: "desc" },
        take: 12,
        select: { id: true, name: true, jobTitle: true, avatarPath: true, lastSeenAt: true },
      }),
      db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    ]);

  const overdue = openTasks.filter((t) => t.dueDate && new Date(t.dueDate) < todayStart);
  const dueToday = openTasks.filter((t) => t.dueDate && new Date(t.dueDate) >= todayStart && new Date(t.dueDate) < tomorrow);
  const dueThisWeek = openTasks.filter((t) => t.dueDate && new Date(t.dueDate) >= tomorrow && new Date(t.dueDate) < weekFromNow);
  const focus = timer ? null : overdue[0] ?? dueToday[0] ?? openTasks[0] ?? null;

  const weekHours = weekEntries.reduce((s, e) => s + e.hours, 0);
  const perDay = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart.getTime() + i * DAY);
    const next = new Date(day.getTime() + DAY);
    const hours = weekEntries
      .filter((e) => new Date(e.date) >= day && new Date(e.date) < next)
      .reduce((s, e) => s + e.hours, 0);
    return { hours, isToday: day.getTime() === todayStart.getTime() };
  });
  const peak = Math.max(...perDay.map((d) => d.hours), 1);

  const first = user.name.split(" ")[0];
  const dateLine = zonedDateLine(now, tz);
  const localHour = zonedHour(now, tz);
  const summary =
    overdue.length > 0
      ? `You have ${overdue.length} overdue and ${dueToday.length} due today.`
      : dueToday.length > 0
        ? `${dueToday.length} task${dueToday.length === 1 ? "" : "s"} due today — let's get to it.`
        : openTasks.length > 0
          ? "Nothing due today. A good day to get ahead."
          : "You're all caught up. 🎉";

  const chips = [
    { label: "Open", value: openTasks.length, href: "/tasks?assignee=me&open=1" },
    { label: "Overdue", value: overdue.length, href: "/tasks?assignee=me&overdue=1" },
    { label: "Due today", value: dueToday.length, href: "/my-tasks" },
    { label: "Done this week", value: doneThisWeek, href: "/tasks?assignee=me&status=DONE" },
  ];

  return (
    <div className="space-y-6">
      <ReviewTasksBanner />
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-600 to-sky-500 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-sky-100">
              <span>{dateLine}</span>
              <span className="text-sky-200/70">·</span>
              <LiveClock tz={tz} className="tabular-nums" />
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
              {greeting(localHour)}, {first}
            </h1>
            <p className="mt-1 text-sky-50/90">{summary}</p>
          </div>
          <Link href="/tasks?new=1" className="rounded-lg bg-white/95 px-4 py-2 text-sm font-semibold text-sky-700 shadow-sm hover:bg-white">
            + New task
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {chips.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm transition hover:bg-white/20"
            >
              <div className="text-2xl font-bold">{c.value}</div>
              <div className="text-xs text-sky-50/90">{c.label}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: focus + agenda */}
        <div className="space-y-6 lg:col-span-2">
          <QuickAdd />

          {/* Focus now */}
          <div className="card p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Focus now</h2>
            {timer ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-100 text-xl">⏱️</span>
                  <div className="min-w-0">
                    <Link href={`/tasks/${timer.task.id}`} className="block truncate font-medium hover:text-sky-700">
                      {timer.task.title}
                    </Link>
                    <LiveElapsed startedAt={timer.startedAt.toISOString()} className="text-sm text-sky-600" />
                    <span className="ml-1 text-xs text-slate-400">running</span>
                  </div>
                </div>
                <form action={stopTaskTimer}>
                  <input type="hidden" name="back" value="/dashboard" />
                  <button type="submit" className="btn-secondary !py-1.5 text-xs">⏹ Stop &amp; log</button>
                </form>
              </div>
            ) : focus ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-0.5 text-xs text-slate-400">Suggested next task</div>
                  <Link href={`/tasks/${focus.id}`} className="block truncate font-medium hover:text-sky-700">
                    {focus.title}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <span className={`badge ${lookup(TASK_PRIORITIES, focus.priority).badge}`}>
                      {lookup(TASK_PRIORITIES, focus.priority).label}
                    </span>
                    {focus.project && <span>{focus.project.name}</span>}
                    {focus.dueDate && (
                      <span className={new Date(focus.dueDate) < todayStart ? "font-semibold text-red-600" : ""}>
                        due {fmtDate(focus.dueDate)}
                      </span>
                    )}
                  </div>
                </div>
                <form action={startTaskTimer}>
                  <input type="hidden" name="taskId" value={focus.id} />
                  <input type="hidden" name="back" value="/dashboard" />
                  <button type="submit" className="btn-primary !py-1.5 text-xs">▶ Start timer</button>
                </form>
              </div>
            ) : (
              <p className="py-2 text-sm text-slate-400">No open tasks — enjoy the clear runway. 🌤️</p>
            )}
          </div>

          {/* Today's agenda */}
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold">Today &amp; upcoming</h2>
              <Link href="/my-tasks" className="text-sm text-sky-600 hover:underline">
                My Tasks
              </Link>
            </div>
            {overdue.length + dueToday.length + dueThisWeek.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-400">
                Nothing scheduled. {openTasks.length > 0 ? "Your open tasks have no near-term due dates." : "You're all caught up!"}
              </p>
            ) : (
              <div>
                <AgendaGroup title="Overdue" accent="bg-red-500" tasks={overdue} todayStart={todayStart} />
                <AgendaGroup title="Due today" accent="bg-amber-500" tasks={dueToday} todayStart={todayStart} />
                <AgendaGroup title="This week" accent="bg-sky-500" tasks={dueThisWeek} todayStart={todayStart} />
              </div>
            )}
          </div>
        </div>

        {/* Right: week + people + activity */}
        <div className="space-y-6">
          {/* This week */}
          <div className="card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">This week</h2>
              <Link href="/timesheet" className="text-xs text-sky-600 hover:underline">Timesheet</Link>
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-3xl font-bold">{fmtHours(weekHours)}</span>
              <span className="pb-1 text-xs text-slate-400">logged</span>
            </div>
            <div className="mt-3 flex h-16 items-end gap-1.5">
              {perDay.map((d, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-12 w-full items-end rounded bg-slate-100">
                    <div
                      className={`w-full rounded ${d.isToday ? "bg-sky-500" : "bg-sky-300"}`}
                      style={{ height: `${d.hours > 0 ? Math.max(8, Math.round((d.hours / peak) * 100)) : 0}%` }}
                      title={fmtHours(d.hours)}
                    />
                  </div>
                  <span className={`text-[9px] ${d.isToday ? "font-semibold text-sky-600" : "text-slate-400"}`}>
                    {DAY_LABELS[i]}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="text-slate-500">Completed <b className="text-green-600">{doneThisWeek}</b></span>
              <span className="text-slate-500">Open <b className="text-sky-600">{openTasks.length}</b></span>
              <span className="text-slate-500">This month <b>{doneThisMonth}</b></span>
            </div>
          </div>

          {/* Office hours across the team */}
          <OfficeClocks myCode={user.company.code} />

          {/* Active now */}
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Active now
                <span className="text-sm font-normal text-slate-400">({activeUsers.length})</span>
              </h2>
              <Link href="/messages" className="text-sm text-sky-600 hover:underline">Message</Link>
            </div>
            <div className="p-4">
              {activeUsers.length === 0 ? (
                <p className="py-3 text-center text-sm text-slate-400">No one else is online right now.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {activeUsers.map((u) => (
                    <Link
                      key={u.id}
                      href={`/messages/${u.id}`}
                      title={`Message ${u.name}${u.jobTitle ? ` · ${u.jobTitle}` : ""}`}
                      className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/50"
                    >
                      <UserAvatar user={u} size={28} presence={u.lastSeenAt} />
                      <span className="text-sm">{u.name.split(" ")[0]}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Latest updates */}
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold">Latest updates</h2>
              <Link href="/notifications" className="text-sm text-sky-600 hover:underline">Inbox</Link>
            </div>
            <div className="divide-y divide-slate-100">
              {notifications.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-slate-400">Nothing new right now.</p>
              )}
              {notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.link ?? "/notifications"}
                  className={`flex items-start gap-2 px-5 py-3 text-sm hover:bg-slate-50 ${n.read ? "" : "bg-sky-50/40"}`}
                >
                  {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-500" />}
                  <span className={n.read ? "ml-4" : ""}>
                    <span className="block text-slate-700">{n.message}</span>
                    <span className="text-xs text-slate-400">{fmtRelative(n.createdAt)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Active projects */}
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold">Active projects</h2>
              <Link href="/projects" className="text-sm text-sky-600 hover:underline">View all</Link>
            </div>
            <div className="divide-y divide-slate-100">
              {activeProjects.length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-slate-400">No active projects.</p>
              )}
              {activeProjects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="block px-5 py-3 hover:bg-slate-50">
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.company.name} · {p._count.tasks} tasks</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type AgendaTask = {
  id: number;
  title: string;
  priority: string;
  dueDate: Date | null;
  project: { name: string } | null;
  subtasks: { status: string }[];
};

function AgendaGroup({
  title,
  accent,
  tasks,
  todayStart,
}: {
  title: string;
  accent: string;
  tasks: AgendaTask[];
  todayStart: Date;
}) {
  if (tasks.length === 0) return null;
  const shown = tasks.slice(0, 5);
  return (
    <div>
      <div className="flex items-center gap-2 bg-slate-50/60 px-5 py-2">
        <span className={`h-2 w-2 rounded-full ${accent}`} />
        <span className="text-xs font-semibold text-slate-600">{title}</span>
        <span className="text-xs text-slate-400">({tasks.length})</span>
      </div>
      <div className="divide-y divide-slate-100">
        {shown.map((t) => {
          const priority = lookup(TASK_PRIORITIES, t.priority);
          const doneSubs = t.subtasks.filter((s) => s.status === "DONE").length;
          const overdue = t.dueDate && new Date(t.dueDate) < todayStart;
          return (
            <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
              <form action={setTaskStatus}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="status" value="DONE" />
                <input type="hidden" name="back" value="/dashboard" />
                <button
                  type="submit"
                  title="Mark as done"
                  className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-300 text-transparent transition-colors hover:border-green-500 hover:bg-green-500 hover:text-white"
                >
                  ✓
                </button>
              </form>
              <div className="min-w-0 flex-1">
                <Link href={`/tasks/${t.id}`} className="block truncate text-sm font-medium hover:text-sky-700">
                  {t.title}
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {t.project && <span>{t.project.name}</span>}
                  {t.subtasks.length > 0 && <span>{doneSubs}/{t.subtasks.length} subtasks</span>}
                </div>
              </div>
              <span className={`badge ${priority.badge}`}>{priority.label}</span>
              <span className={`w-20 text-right text-xs ${overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>
                {fmtDate(t.dueDate)}
              </span>
            </div>
          );
        })}
        {tasks.length > shown.length && (
          <Link href="/my-tasks" className="block px-5 py-2 text-xs text-sky-600 hover:bg-slate-50 hover:underline">
            +{tasks.length - shown.length} more in My Tasks →
          </Link>
        )}
      </div>
    </div>
  );
}
