import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import UserAvatar from "@/components/UserAvatar";
import { fmtHours } from "@/lib/ui";
import { weekStartOf } from "@/lib/timerange";
import SearchSelect from "@/components/SearchSelect";
import { ActiveTimersProvider, WorkingCell } from "@/components/ActiveTimers";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

const DAY = 86400000;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAILY_CAPACITY = 8; // hours
const WEEKLY_CAPACITY = 40; // hours

/** Colour a day cell by estimated hours of work due that day. */
function loadClass(h: number) {
  if (h <= 0) return "bg-slate-50 text-slate-300 dark:bg-slate-800";
  if (h <= DAILY_CAPACITY / 2) return "bg-sky-100 text-sky-700";
  if (h <= DAILY_CAPACITY) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

/** Compact hours label for tight cells, e.g. "6h", "1.5h". */
function hCompact(h: number) {
  if (!h) return "";
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

function toDateParam(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function WorkloadPage({
  searchParams,
}: {
  searchParams: { start?: string; company?: string; department?: string; assignee?: string; over?: string };
}) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/dashboard");

  const weekStart = weekStartOf(searchParams.start ? new Date(searchParams.start) : new Date());
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY);

  const companyId = searchParams.company ? Number(searchParams.company) : null;
  const departmentId = searchParams.department ? Number(searchParams.department) : null;
  const assigneeId = searchParams.assignee ? Number(searchParams.assignee) : null;
  const overOnly = searchParams.over === "1";

  // Keep active filters attached to the week-navigation links.
  const carry = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (companyId) p.set("company", String(companyId));
    if (departmentId) p.set("department", String(departmentId));
    if (assigneeId) p.set("assignee", String(assigneeId));
    if (overOnly) p.set("over", "1");
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `/workload?${s}` : "/workload";
  };

  const [users, tasks, entries, companies, departments, allUsers, runningTimers] = await Promise.all([
    db.user.findMany({
      where: {
        active: true,
        ...(companyId ? { companyId } : {}),
        ...(departmentId ? { departmentId } : {}),
        ...(assigneeId ? { id: assigneeId } : {}),
      },
      include: { department: true },
      orderBy: { name: "asc" },
    }),
    db.task.findMany({
      where: {
        deletedAt: null,
        status: { not: "DONE" },
        assigneeId: { not: null },
        dueDate: { not: null, lt: weekEnd },
      },
      select: { id: true, assigneeId: true, dueDate: true, estimateHours: true },
    }),
    db.timeEntry.findMany({
      where: { date: { gte: weekStart, lt: weekEnd } },
      select: { userId: true, hours: true },
    }),
    db.company.findMany({ orderBy: { code: "asc" } }),
    db.department.findMany({ include: { company: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Anyone with a timer running right now, to show live on their row.
    db.taskTimer.findMany({
      include: {
        user: { select: { id: true, name: true, avatarPath: true } },
        task: { select: { id: true, title: true, estimateHours: true, deletedAt: true } },
      },
    }),
  ]);

  const activeTimers = runningTimers
    .filter((t) => t.task && !t.task.deletedAt)
    .map((t) => ({
      id: t.id,
      userId: t.userId,
      userName: t.user.name,
      avatarPath: t.user.avatarPath,
      taskId: t.task!.id,
      taskTitle: t.task!.title,
      estimateHours: t.task!.estimateHours,
      startedAt: t.startedAt.toISOString(),
    }));

  const hoursByUser = new Map<number, number>();
  for (const e of entries) hoursByUser.set(e.userId, (hoursByUser.get(e.userId) ?? 0) + e.hours);

  let rows = users.map((u) => {
    const perDayHours = [0, 0, 0, 0, 0, 0, 0];
    const perDayCount = [0, 0, 0, 0, 0, 0, 0];
    let overdue = 0;
    for (const t of tasks) {
      if (t.assigneeId !== u.id || !t.dueDate) continue;
      const due = new Date(t.dueDate);
      const est = t.estimateHours ?? 0;
      if (due < weekStart) {
        overdue += 1;
      } else {
        const idx = Math.floor((due.getTime() - weekStart.getTime()) / DAY);
        if (idx >= 0 && idx < 7) {
          perDayHours[idx] += est;
          perDayCount[idx] += 1;
        }
      }
    }
    const weekEstimate = perDayHours.reduce((a, b) => a + b, 0);
    const weekCount = perDayCount.reduce((a, b) => a + b, 0);
    const maxDay = Math.max(...perDayHours);
    const load =
      weekEstimate > WEEKLY_CAPACITY || maxDay > DAILY_CAPACITY
        ? "heavy"
        : weekEstimate > WEEKLY_CAPACITY * 0.6
          ? "busy"
          : weekCount > 0
            ? "ok"
            : "free";
    return {
      user: u,
      perDayHours,
      perDayCount,
      weekEstimate,
      weekCount,
      overdue,
      logged: hoursByUser.get(u.id) ?? 0,
      load,
    };
  });

  if (overOnly) rows = rows.filter((r) => r.load === "heavy");

  const teamEstimate = rows.reduce((s, r) => s + r.weekEstimate, 0);
  const heavyCount = rows.filter((r) => r.load === "heavy").length;
  const isThisWeek = weekStart.getTime() === weekStartOf(new Date()).getTime();
  const filtersActive = !!(companyId || departmentId || assigneeId || overOnly);
  const weekLabel = `${weekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – ${new Date(
    weekEnd.getTime() - DAY
  ).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;

  const prev = toDateParam(new Date(weekStart.getTime() - 7 * DAY));
  const next = toDateParam(new Date(weekStart.getTime() + 7 * DAY));

  return (
    <div className="space-y-4">
      <AutoRefresh />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Workload</h1>
          <p className="text-sm text-slate-500">
            Estimated hours of work due per person this week — spot who&apos;s over capacity
            (~{WEEKLY_CAPACITY}h/week).
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-sky-600">{fmtHours(teamEstimate)}</div>
          <div className="text-xs text-slate-500">estimated · {heavyCount} over capacity</div>
        </div>
      </div>

      <form className="card flex flex-wrap items-end gap-3 p-4" method="GET">
        <input type="hidden" name="start" value={toDateParam(weekStart)} />
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
          <SearchSelect
            name="company"
            defaultValue={searchParams.company ?? ""}
            className="w-48"
            placeholder="All companies"
            options={[{ value: "", label: "All companies" }, ...companies.map((c) => ({ value: String(c.id), label: `${c.code} — ${c.name}` }))]}
          />
        </div>
        <div>
          <label className="label">Department</label>
          <SearchSelect
            name="department"
            defaultValue={searchParams.department ?? ""}
            className="w-48"
            placeholder="All departments"
            searchPlaceholder="Search departments…"
            options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: String(d.id), label: `${d.name} (${d.company.code})` }))]}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input type="checkbox" name="over" value="1" defaultChecked={overOnly} className="h-4 w-4" />
          Over capacity only
        </label>
        <button type="submit" className="btn-primary">
          Apply
        </button>
        {filtersActive && (
          <Link href={`/workload?start=${toDateParam(weekStart)}`} className="btn-secondary">
            Clear
          </Link>
        )}
      </form>

      <div className="card flex items-center justify-between p-3">
        <Link href={carry({ start: prev })} className="btn-secondary !py-1.5 text-xs">← Prev week</Link>
        <div className="text-sm font-medium">
          {isThisWeek ? "This week" : "Week of"} · {weekLabel}
        </div>
        <div className="flex gap-2">
          {!isThisWeek && <Link href={carry({ start: undefined })} className="btn-secondary !py-1.5 text-xs">Today</Link>}
          <Link href={carry({ start: next })} className="btn-secondary !py-1.5 text-xs">Next week →</Link>
        </div>
      </div>

      <ActiveTimersProvider initial={activeTimers}>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Employee</th>
              {DAY_LABELS.map((d, i) => {
                const day = new Date(weekStart.getTime() + i * DAY);
                return (
                  <th key={d} className="th text-center">
                    {d}
                    <div className="font-normal text-slate-400">{day.getDate()}</div>
                  </th>
                );
              })}
              <th className="th text-center">Est.</th>
              <th className="th text-center">Overdue</th>
              <th className="th text-center">Logged</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="td py-8 text-center text-slate-400">
                  No people match these filters.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.user.id} className="hover:bg-slate-50">
                <td className="td">
                  <Link href={`/people/${r.user.id}`} className="flex items-center gap-2 hover:text-sky-700" title="View profile">
                    <UserAvatar user={r.user} size={28} presence={r.user.lastSeenAt} />
                    <span>
                      <span className="font-medium">{r.user.name}</span>
                      {r.load === "heavy" && (
                        <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          Over capacity
                        </span>
                      )}
                      <span className="block text-xs text-slate-400">{r.user.department?.name ?? "—"}</span>
                    </span>
                  </Link>
                  <WorkingCell userId={r.user.id} />
                </td>
                {r.perDayHours.map((h, i) => (
                  <td key={i} className="td text-center">
                    <span
                      className={`inline-flex h-9 w-11 flex-col items-center justify-center rounded-md text-xs font-semibold leading-tight ${loadClass(h)}`}
                      title={`${r.perDayCount[i]} task(s), ${fmtHours(h)} estimated`}
                    >
                      {h > 0 ? hCompact(h) : r.perDayCount[i] > 0 ? "·" : ""}
                      {r.perDayCount[i] > 0 && (
                        <span className="text-[9px] font-normal opacity-70">{r.perDayCount[i]}t</span>
                      )}
                    </span>
                  </td>
                ))}
                <td className="td text-center font-medium">{r.weekEstimate > 0 ? fmtHours(r.weekEstimate) : "—"}</td>
                <td className={`td text-center ${r.overdue > 0 ? "font-semibold text-red-600" : "text-slate-400"}`}>
                  {r.overdue || "—"}
                </td>
                <td className="td text-center text-slate-600">{r.logged > 0 ? fmtHours(r.logged) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </ActiveTimersProvider>

      <div className="flex flex-wrap items-center gap-3 px-1 text-[11px] text-slate-500">
        <span>Estimated hours due per day:</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-sky-100" /> ≤{DAILY_CAPACITY / 2}h</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-amber-100" /> ≤{DAILY_CAPACITY}h</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-red-100" /> &gt;{DAILY_CAPACITY}h</span>
        <span className="text-slate-400">· “·” = tasks with no estimate</span>
      </div>
    </div>
  );
}
