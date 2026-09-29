import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/ui";
import CalendarBoard, { type CalDay, type CalMark, type CalTask } from "@/components/CalendarGrid";
import { eachDay, isWorkingDay, leaveType, weekendSet, ymd, ymdLocal, todayIn } from "@/lib/leave";
import { holidaysFor, leaveBetween } from "@/lib/leaveData";
import { companyTimezone } from "@/lib/tz";
import { anchorFrom, monthStartOf, stepAnchor, viewTitle, visibleDays, weekdayOf, type CalView } from "@/lib/calendarRange";
import SearchSelect from "@/components/SearchSelect";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

type SP = {
  d?: string;
  m?: string;
  view?: string;
  scope?: string;
  assignee?: string;
  project?: string;
  status?: string;
  priority?: string;
  done?: string;
};

export default async function CalendarPage(props: { searchParams: Promise<SP> }) {
  const sp = await props.searchParams;
  const user = await requireUser();
  const isManager = isManagerOrAdmin(user.role);

  const tz = companyTimezone(user.company);
  const today = todayIn(tz);
  const view: CalView = sp.view === "week" || sp.view === "agenda" ? sp.view : "month";
  const anchor = anchorFrom(sp, today);
  const days = visibleDays(view, anchor);
  const from = days[0];
  const to = days[days.length - 1];

  const assigneeId = sp.assignee ? Number(sp.assignee) || null : null;
  const projectId = sp.project ? Number(sp.project) || null : null;
  const status = sp.status && TASK_STATUSES.some((s) => s.value === sp.status) ? sp.status : null;
  const priority = sp.priority && TASK_PRIORITIES.some((p) => p.value === sp.priority) ? sp.priority : null;
  const hideDone = sp.done === "0";
  // A specific assignee filter implies looking beyond your own tasks.
  const mine = sp.scope !== "all" && !assigneeId;
  const who = assigneeId ? { assigneeId } : mine ? { assigneeId: user.id } : {};

  // Holidays and approved leave in range, shown on the day cells.
  const [rangeHolidays, rangeLeave, offices] = await Promise.all([
    holidaysFor(mine ? user.companyId : null, from, to),
    leaveBetween(from, to, assigneeId ? { userIds: [assigneeId] } : mine ? { userIds: [user.id] } : {}),
    db.company.findMany({ select: { id: true, weekendDays: true } }),
  ]);
  const marks: CalMark[] = rangeHolidays.map((h) => ({
    date: ymd(h.date),
    kind: "holiday" as const,
    label: h.name,
    title: `${h.name} — ${h.company?.code ?? "all offices"}`,
  }));
  const weekendOf = new Map(offices.map((c) => [c.id, weekendSet(c.weekendDays)]));
  const allHolidays = rangeLeave.length ? await holidaysFor(null, from, to) : [];
  for (const l of rangeLeave) {
    const theirHolidays = new Set(allHolidays.filter((h) => h.companyId === null || h.companyId === l.user.companyId).map((h) => ymd(h.date)));
    for (const d of eachDay(ymd(l.startDate), ymd(l.endDate))) {
      if (d < from || d > to) continue;
      if (!isWorkingDay(d, weekendOf.get(l.user.companyId) ?? new Set(), theirHolidays)) continue;
      marks.push({
        date: d,
        kind: "leave",
        label: l.userId === user.id ? "You're off" : l.user.name.split(" ")[0],
        title: `${l.user.name} — ${leaveType(l.type).label}${l.halfDay ? " (half day)" : ""}`,
      });
    }
  }

  const [y0, m0, d0] = from.split("-").map(Number);
  const [y1, m1, d1] = to.split("-").map(Number);
  const [tasks, unscheduled, users, projects] = await Promise.all([
    db.task.findMany({
      where: {
        dueDate: { gte: new Date(y0, m0 - 1, d0), lt: new Date(y1, m1 - 1, d1 + 1) },
        deletedAt: null,
        ...who,
        ...(projectId ? { projectId } : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
      },
      include: { assignee: { select: { id: true, name: true } }, project: { select: { name: true } } },
    }),
    view === "agenda"
      ? Promise.resolve([])
      : db.task.findMany({
          where: {
            dueDate: null,
            deletedAt: null,
            status: { not: "DONE" },
            seriesId: null,
            ...who,
            ...(projectId ? { projectId } : {}),
            ...(priority ? { priority } : {}),
          },
          include: { assignee: { select: { id: true, name: true } }, project: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 60,
        }),
    isManager ? db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    db.project.findMany({ where: { status: { in: ["ACTIVE", "ON_HOLD"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const toCal = (t: (typeof tasks)[number]): CalTask => {
    const date = t.dueDate ? ymdLocal(t.dueDate) : null;
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assigneeName: t.assignee?.name ?? null,
      projectName: t.project?.name ?? null,
      date,
      overdue: !!date && date < today && t.status !== "DONE",
      editable: isManager || t.assigneeId === user.id || t.createdById === user.id,
    };
  };
  const all = tasks
    .map(toCal)
    .sort((a, b) => Number(a.status === "DONE") - Number(b.status === "DONE") || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.title.localeCompare(b.title));

  // Headline numbers for the month (or week) in view — before "hide done".
  const inPeriod = all.filter((t) => (view === "week" ? true : t.date!.startsWith(anchor.slice(0, 7))));
  const stats = {
    total: inPeriod.length,
    done: inPeriod.filter((t) => t.status === "DONE").length,
    overdue: inPeriod.filter((t) => t.overdue).length,
    open: inPeriod.filter((t) => t.status !== "DONE").length,
  };
  const shown = hideDone ? all.filter((t) => t.status !== "DONE") : all;

  const weekend = weekendSet(user.company.weekendDays);
  const month = anchor.slice(0, 7);
  const calDays: CalDay[] = days.map((d) => ({
    date: d,
    inMonth: view === "week" || d.startsWith(month),
    today: d === today,
    weekend: weekend.has(weekdayOf(d)),
    past: d < today,
  }));

  // Keeps scope + filters across navigation.
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (!mine) p.set("scope", "all");
    if (assigneeId) p.set("assignee", String(assigneeId));
    if (projectId) p.set("project", String(projectId));
    if (status) p.set("status", status);
    if (priority) p.set("priority", priority);
    if (hideDone) p.set("done", "0");
    if (view !== "month") p.set("view", view);
    p.set("d", anchor);
    for (const [k, v] of Object.entries(over)) {
      if (v === undefined) p.delete(k);
      else p.set(k, v);
    }
    return `/calendar?${p.toString()}`;
  };
  const prevHref = href({ d: stepAnchor(view, anchor, -1) });
  const nextHref = href({ d: stepAnchor(view, anchor, 1) });
  const todayHref = href({ d: undefined });
  const filtersActive = !!(assigneeId || projectId || status || priority);
  const isThisPeriod = view === "week" ? days.includes(today) : monthStartOf(anchor) === monthStartOf(today);

  const segBtn = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm ${active ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"}`;

  return (
    <div className="space-y-4">
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-slate-500">
            Tasks by due date · drag to reschedule · click a day to add
            <span className="hidden sm:inline"> · ← → keys to move, T for today</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-600" role="group" aria-label="Whose tasks">
            <Link href={href({ scope: undefined, assignee: undefined })} className={segBtn(mine)}>
              My tasks
            </Link>
            <Link href={href({ scope: "all" })} className={segBtn(!mine)}>
              Everyone
            </Link>
          </div>
          <div className="flex rounded-lg border border-slate-300 p-0.5 dark:border-slate-600" role="group" aria-label="View">
            {(["month", "week", "agenda"] as const).map((v) => (
              <Link key={v} href={href({ view: v === "month" ? undefined : v })} className={segBtn(view === v)}>
                {v === "month" ? "Month" : v === "week" ? "Week" : "Agenda"}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={prevHref} className="btn-secondary !px-3" aria-label="Previous" data-cal-prev>
            ←
          </Link>
          <Link href={todayHref} className={`btn-secondary !px-3 ${isThisPeriod ? "opacity-60" : ""}`} data-cal-today>
            Today
          </Link>
          <Link href={nextHref} className="btn-secondary !px-3" aria-label="Next" data-cal-next>
            →
          </Link>
          <h2 className="ml-2 text-lg font-semibold">{viewTitle(view, anchor)}</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Stat label={view === "week" ? "Due this week" : "Due this month"} value={stats.total} />
          <Stat label="Open" value={stats.open} tone="text-sky-700 dark:text-sky-300" />
          <Stat label="Done" value={stats.done} tone="text-emerald-700 dark:text-emerald-300" />
          <Stat label="Overdue" value={stats.overdue} tone={stats.overdue ? "text-red-600" : undefined} />
        </div>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4" method="GET">
        <input type="hidden" name="d" value={anchor} />
        {view !== "month" && <input type="hidden" name="view" value={view} />}
        {!mine && <input type="hidden" name="scope" value="all" />}
        {isManager && (
          <div>
            <label className="label">Assignee</label>
            <SearchSelect
              name="assignee"
              defaultValue={sp.assignee ?? ""}
              className="w-44"
              placeholder="Everyone"
              searchPlaceholder="Search people…"
              options={[{ value: "", label: "Everyone" }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]}
            />
          </div>
        )}
        <div>
          <label className="label">Project</label>
          <SearchSelect
            name="project"
            defaultValue={sp.project ?? ""}
            className="w-44"
            placeholder="All projects"
            searchPlaceholder="Search projects…"
            options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]}
          />
        </div>
        <div>
          <label className="label">Status</label>
          <SearchSelect
            name="status"
            defaultValue={sp.status ?? ""}
            className="w-36"
            placeholder="Any status"
            options={[{ value: "", label: "Any status" }, ...TASK_STATUSES.map((s) => ({ value: s.value, label: s.label }))]}
          />
        </div>
        <div>
          <label className="label">Priority</label>
          <SearchSelect
            name="priority"
            defaultValue={sp.priority ?? ""}
            className="w-36"
            placeholder="Any priority"
            options={[{ value: "", label: "Any priority" }, ...TASK_PRIORITIES.map((p) => ({ value: p.value, label: p.label }))]}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" name="done" value="0" defaultChecked={hideDone} className="h-4 w-4 rounded border-slate-300 text-sky-600" />
          Hide done
        </label>
        <button type="submit" className="btn-primary">
          Apply
        </button>
        {(filtersActive || hideDone) && (
          <Link href={`/calendar?d=${anchor}${view !== "month" ? `&view=${view}` : ""}${mine ? "" : "&scope=all"}`} className="btn-secondary">
            Clear
          </Link>
        )}
      </form>

      <CalendarBoard
        view={view}
        days={calDays}
        tasks={shown}
        unscheduled={unscheduled.map(toCal)}
        marks={marks}
        showAssignee={!mine && !assigneeId}
        people={isManager ? users : []}
        defaultAssignee={assigneeId ?? user.id}
        nav={{ prev: prevHref, next: nextHref, today: todayHref }}
        back={href({})}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800">
      <span className="text-slate-500">{label}</span> <b className={tone}>{value}</b>
    </span>
  );
}
