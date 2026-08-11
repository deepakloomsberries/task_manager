import Link from "next/link";
import { db } from "@/lib/db";
import UserAvatar from "@/components/UserAvatar";
import LiveClock from "@/components/LiveClock";
import RunningTimerBadge from "@/components/RunningTimerBadge";
import OfficeClocks from "@/components/OfficeClocks";
import { companyTimezone, zonedStartOfToday, zonedHour, zonedDateLine } from "@/lib/tz";
import { fmtHours, fmtRelative, ONLINE_WINDOW_MS } from "@/lib/ui";

const DAY = 86400000;
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKLY_CAPACITY = 40;

function greeting(h: number) {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function activityPhrase(a: { type: string; detail: string | null }) {
  if (a.type === "created") return "created";
  return a.detail ?? a.type;
}

type AdminUser = {
  id: number;
  name: string;
  role: string;
  company: { code: string };
};

/**
 * The workspace command centre shown to admins instead of a personal task
 * list. It answers "what needs me and how is the team doing?" rather than
 * "what are my tasks?".
 */
export default async function AdminDashboard({ user }: { user: AdminUser }) {
  const now = new Date();
  const tz = companyTimezone(user.company);
  const todayStart = zonedStartOfToday(now, tz);
  const tomorrow = new Date(todayStart.getTime() + DAY);
  const dow = new Date(
    Date.UTC(
      Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric" }).format(now)),
      Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "numeric" }).format(now)) - 1,
      Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).format(now))
    )
  ).getUTCDay();
  const weekStart = new Date(todayStart.getTime() - dow * DAY);
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY);
  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);

  const [
    teamOpen,
    teamOverdue,
    teamDueToday,
    teamDoneThisWeek,
    inReview,
    unassignedOpen,
    pendingTimesheets,
    openAssigned,
    people,
    activeProjects,
    weekEntries,
    activities,
    runningTimers,
  ] = await Promise.all([
    db.task.count({ where: { status: { not: "DONE" }, deletedAt: null } }),
    db.task.count({ where: { status: { not: "DONE" }, deletedAt: null, dueDate: { lt: todayStart } } }),
    db.task.count({ where: { status: { not: "DONE" }, deletedAt: null, dueDate: { gte: todayStart, lt: tomorrow } } }),
    db.task.count({ where: { status: "DONE", deletedAt: null, completedAt: { gte: weekStart, lt: weekEnd } } }),
    db.task.count({ where: { status: "REVIEW", deletedAt: null } }),
    db.task.count({ where: { status: { not: "DONE" }, deletedAt: null, assigneeId: null } }),
    db.timesheetSubmission.count({ where: { status: "SUBMITTED" } }),
    db.task.findMany({
      where: { status: { not: "DONE" }, deletedAt: null, assigneeId: { not: null } },
      select: { assigneeId: true, dueDate: true, estimateHours: true },
    }),
    db.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, jobTitle: true, avatarPath: true, lastSeenAt: true },
    }),
    db.project.findMany({ where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 5, include: { company: true } }),
    db.timeEntry.findMany({ where: { date: { gte: weekStart, lt: weekEnd } }, select: { date: true, hours: true } }),
    db.taskActivity.findMany({
      orderBy: { createdAt: "desc" },
      take: 9,
      include: { actor: { select: { id: true, name: true, avatarPath: true } }, task: { select: { id: true, title: true, deletedAt: true } } },
    }),
    db.taskTimer.findMany({
      orderBy: { startedAt: "asc" },
      include: {
        user: { select: { id: true, name: true, avatarPath: true } },
        task: { select: { id: true, title: true, estimateHours: true } },
      },
    }),
  ]);

  // Per-person load for "over capacity" and the "people to watch" list.
  const load = new Map<number, { overdue: number; open: number; estimate: number }>();
  for (const p of people) load.set(p.id, { overdue: 0, open: 0, estimate: 0 });
  for (const t of openAssigned) {
    const l = t.assigneeId != null ? load.get(t.assigneeId) : null;
    if (!l) continue;
    l.open += 1;
    if (t.dueDate && new Date(t.dueDate) < todayStart) l.overdue += 1;
    if (t.dueDate && new Date(t.dueDate) < weekEnd) l.estimate += t.estimateHours ?? 0;
  }
  const overCapacity = people.filter((p) => (load.get(p.id)?.estimate ?? 0) > WEEKLY_CAPACITY).length;
  const watch = people
    .map((p) => ({ user: p, ...(load.get(p.id) ?? { overdue: 0, open: 0, estimate: 0 }) }))
    .filter((r) => r.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open)
    .slice(0, 4);

  const onlineUsers = people
    .filter((p) => p.lastSeenAt && new Date(p.lastSeenAt) >= onlineSince)
    .sort((a, b) => new Date(b.lastSeenAt as Date).getTime() - new Date(a.lastSeenAt as Date).getTime())
    .slice(0, 12);

  // Project progress.
  const projTasks = activeProjects.length
    ? await db.task.findMany({ where: { deletedAt: null, projectId: { in: activeProjects.map((p) => p.id) } }, select: { projectId: true, status: true } })
    : [];
  const projRows = activeProjects.map((p) => {
    const ts = projTasks.filter((t) => t.projectId === p.id);
    const done = ts.filter((t) => t.status === "DONE").length;
    return { project: p, total: ts.length, done, pct: ts.length ? Math.round((done / ts.length) * 100) : 0 };
  });

  // Team hours this week.
  const teamHours = weekEntries.reduce((s, e) => s + e.hours, 0);
  const perDay = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart.getTime() + i * DAY);
    const next = new Date(day.getTime() + DAY);
    const hours = weekEntries.filter((e) => new Date(e.date) >= day && new Date(e.date) < next).reduce((s, e) => s + e.hours, 0);
    return { hours, isToday: day.getTime() === todayStart.getTime() };
  });
  const peak = Math.max(...perDay.map((d) => d.hours), 1);

  const first = user.name.split(" ")[0];
  const summary =
    pendingTimesheets > 0
      ? `${pendingTimesheets} timesheet${pendingTimesheets === 1 ? "" : "s"} await your approval.`
      : teamOverdue > 0
        ? `${teamOverdue} task${teamOverdue === 1 ? "" : "s"} overdue across the team.`
        : "Everything's on track across the team. 🎉";

  const chips = [
    { label: "Open (team)", value: teamOpen, href: "/tasks?open=1" },
    { label: "Overdue", value: teamOverdue, href: "/tasks?overdue=1" },
    { label: "In review", value: inReview, href: "/tasks?status=REVIEW" },
    { label: "To approve", value: pendingTimesheets, href: "/timesheet/team" },
  ];

  const attention = [
    { icon: "🧾", label: "Timesheets to approve", value: pendingTimesheets, href: "/timesheet/team", danger: false },
    { icon: "👀", label: "Tasks in review", value: inReview, href: "/tasks?status=REVIEW", danger: false },
    { icon: "⏰", label: "Overdue tasks", value: teamOverdue, href: "/tasks?overdue=1", danger: true },
    { icon: "🔥", label: "People over capacity", value: overCapacity, href: "/workload?over=1", danger: true },
    { icon: "📥", label: "Unassigned tasks", value: unassignedOpen, href: "/tasks", danger: false },
  ];
  const attentionActive = attention.filter((a) => a.value > 0);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-sky-800 p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-sky-100">
              <span>{zonedDateLine(now, tz)}</span>
              <span className="text-sky-200/70">·</span>
              <LiveClock tz={tz} className="tabular-nums" />
              <span className="ml-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">Admin</span>
            </p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{greeting(zonedHour(now, tz))}, {first}</h1>
            <p className="mt-1 text-sky-50/90">{summary}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/reports" className="rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25">
              Reports
            </Link>
            <Link href="/tasks?new=1" className="rounded-lg bg-white/95 px-4 py-2 text-sm font-semibold text-sky-800 shadow-sm hover:bg-white">
              + New task
            </Link>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {chips.map((c) => (
            <Link key={c.label} href={c.href} className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur-sm transition hover:bg-white/20">
              <div className="text-2xl font-bold">{c.value}</div>
              <div className="text-xs text-sky-50/90">{c.label}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left */}
        <div className="space-y-6 lg:col-span-2">
          {/* Needs your attention */}
          <div className="card">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold">Needs your attention</h2>
            </div>
            {attentionActive.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-400">You&apos;re all clear — nothing needs action right now. 🎉</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {attentionActive.map((a) => (
                  <Link key={a.label} href={a.href} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <span className="text-lg">{a.icon}</span>
                    <span className="flex-1 text-sm">{a.label}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${a.danger ? "bg-red-100 text-red-700" : "bg-sky-100 text-sky-700"}`}>
                      {a.value}
                    </span>
                    <span className="text-slate-300">›</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Working right now */}
          {runningTimers.length > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                <h2 className="font-semibold">Working right now</h2>
                <span className="text-sm font-normal text-slate-400">({runningTimers.length})</span>
              </div>
              <div className="divide-y divide-slate-100">
                {runningTimers.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                    <UserAvatar user={t.user} size={28} />
                    <span className="w-32 shrink-0 truncate text-sm font-medium">{t.user.name}</span>
                    {t.task && (
                      <RunningTimerBadge
                        taskId={t.task.id}
                        title={t.task.title}
                        startedAt={t.startedAt.toISOString()}
                        estimateHours={t.task.estimateHours}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects health */}
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold">Project health</h2>
              <Link href="/projects" className="text-sm text-sky-600 hover:underline">All projects</Link>
            </div>
            <div className="divide-y divide-slate-100">
              {projRows.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">No active projects.</p>}
              {projRows.map((r) => (
                <Link key={r.project.id} href={`/projects/${r.project.id}`} className="block px-5 py-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{r.project.name}</div>
                      <div className="text-xs text-slate-500">{r.project.company.code} · {r.done}/{r.total} done</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-sky-500" style={{ width: `${r.pct}%` }} />
                      </div>
                      <span className="w-9 text-right text-xs text-slate-500">{r.pct}%</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Team activity */}
          <div className="card">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold">Team activity</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {activities.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">No recent activity.</p>}
              {activities.map((a) => (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <UserAvatar user={a.actor} size={28} />
                  <div className="min-w-0 flex-1 text-sm">
                    <span>
                      <b>{a.actor.name.split(" ")[0]}</b> {activityPhrase(a)}{" "}
                      {a.task && !a.task.deletedAt ? (
                        <Link href={`/tasks/${a.task.id}`} className="text-sky-600 hover:underline">{a.task.title}</Link>
                      ) : (
                        <span className="text-slate-400">a task</span>
                      )}
                    </span>
                    <div className="text-xs text-slate-400">{fmtRelative(a.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="space-y-6">
          {/* This week — team */}
          <div className="card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">This week · team</h2>
              <Link href="/timesheet/team" className="text-xs text-sky-600 hover:underline">Timesheets</Link>
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-3xl font-bold">{fmtHours(teamHours)}</span>
              <span className="pb-1 text-xs text-slate-400">logged by the team</span>
            </div>
            <div className="mt-3 flex h-16 items-end gap-1.5">
              {perDay.map((d, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-12 w-full items-end rounded bg-slate-100">
                    <div className={`w-full rounded ${d.isToday ? "bg-sky-500" : "bg-sky-300"}`} style={{ height: `${d.hours > 0 ? Math.max(8, Math.round((d.hours / peak) * 100)) : 0}%` }} title={fmtHours(d.hours)} />
                  </div>
                  <span className={`text-[9px] ${d.isToday ? "font-semibold text-sky-600" : "text-slate-400"}`}>{DAY_LABELS[i]}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between border-t border-slate-100 pt-3 text-sm">
              <span className="text-slate-500">Done <b className="text-green-600">{teamDoneThisWeek}</b></span>
              <span className="text-slate-500">Open <b className="text-sky-600">{teamOpen}</b></span>
              <span className="text-slate-500">Due today <b>{teamDueToday}</b></span>
            </div>
          </div>

          {/* People to watch */}
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold">People to watch</h2>
              <Link href="/workload" className="text-sm text-sky-600 hover:underline">Workload</Link>
            </div>
            <div className="divide-y divide-slate-100">
              {watch.length === 0 && <p className="px-5 py-6 text-center text-sm text-slate-400">No one has overdue work. 👏</p>}
              {watch.map((r) => (
                <Link key={r.user.id} href={`/tasks?assignee=${r.user.id}&open=1`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50">
                  <UserAvatar user={r.user} size={30} presence={r.user.lastSeenAt} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.user.name}</div>
                    <div className="text-xs text-slate-500">{r.open} open{(load.get(r.user.id)?.estimate ?? 0) > WEEKLY_CAPACITY ? " · over capacity" : ""}</div>
                  </div>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{r.overdue} overdue</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Office hours */}
          <OfficeClocks myCode={user.company.code} />

          {/* Active now */}
          <div className="card">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Active now
                <span className="text-sm font-normal text-slate-400">({onlineUsers.length})</span>
              </h2>
              <Link href="/messages" className="text-sm text-sky-600 hover:underline">Message</Link>
            </div>
            <div className="p-4">
              {onlineUsers.length === 0 ? (
                <p className="py-3 text-center text-sm text-slate-400">No one is online right now.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {onlineUsers.map((u) => (
                    <Link key={u.id} href={`/messages/${u.id}`} title={`Message ${u.name}`} className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-3 hover:bg-slate-50">
                      <UserAvatar user={u} size={28} presence={u.lastSeenAt} />
                      <span className="text-sm">{u.name.split(" ")[0]}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
