import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import {
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  submitTimesheet,
  withdrawTimesheet,
} from "@/lib/actions/time";
import ActiveTimerBanner from "@/components/ActiveTimerBanner";
import RangePicker from "@/components/RangePicker";
import SearchSelect from "@/components/SearchSelect";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import { fmtDate, toInputDate, fmtHours, toInputTime, fmtTimeRange } from "@/lib/ui";
import { rangeBounds, weekStartOf } from "@/lib/timerange";

export const dynamic = "force-dynamic";

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: { error?: string; edit?: string; range?: string; from?: string; to?: string };
}) {
  const user = await requireUser();

  const rangeKey = searchParams.range ?? "30d";
  const { from, to, label } = rangeBounds(rangeKey, searchParams.from, searchParams.to);
  const editingId = searchParams.edit ? Number(searchParams.edit) : null;

  // Preserve the active range when returning from an edit/delete/create.
  const viewParams = new URLSearchParams();
  if (rangeKey !== "30d") viewParams.set("range", rangeKey);
  if (rangeKey === "custom") {
    if (searchParams.from) viewParams.set("from", searchParams.from);
    if (searchParams.to) viewParams.set("to", searchParams.to);
  }
  const viewQuery = viewParams.toString();
  const viewHref = viewQuery ? `/timesheet?${viewQuery}` : "/timesheet";
  const editHref = (id: number) => {
    const q = new URLSearchParams(viewQuery);
    q.set("edit", String(id));
    return `/timesheet?${q.toString()}`;
  };

  const chartSince = new Date();
  chartSince.setDate(chartSince.getDate() - 6);
  chartSince.setHours(0, 0, 0, 0);

  const [entries, chartEntries, tasks, projects, activeTimer] = await Promise.all([
    db.timeEntry.findMany({
      where: { userId: user.id, date: { gte: from, lte: to } },
      orderBy: { date: "desc" },
      include: { task: true, project: true },
    }),
    db.timeEntry.findMany({
      where: { userId: user.id, date: { gte: chartSince } },
      select: { date: true, hours: true },
    }),
    db.task.findMany({
      where: { assigneeId: user.id, status: { not: "DONE" }, deletedAt: null },
      orderBy: { title: "asc" },
    }),
    db.project.findMany({
      where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
      orderBy: { name: "asc" },
    }),
    db.taskTimer.findUnique({
      where: { userId: user.id },
      include: { task: { select: { id: true, title: true } } },
    }),
  ]);

  const rangeTotal = entries.reduce((s, e) => s + e.hours, 0);

  // Weekly submit & approve applies when the view is a single week.
  const weekMode = rangeKey === "week" || rangeKey === "last-week";
  const submission = weekMode
    ? await db.timesheetSubmission.findUnique({
        where: { userId_weekStart: { userId: user.id, weekStart: weekStartOf(from) } },
        include: { reviewedBy: { select: { name: true } } },
      })
    : null;
  const locked = !!submission && (submission.status === "SUBMITTED" || submission.status === "APPROVED");

  // Last 7 days mini chart, scaled to the busiest day (with a small floor).
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - i));
    day.setHours(0, 0, 0, 0);
    const next = new Date(day.getTime() + 86400000);
    const hours = chartEntries
      .filter((e) => new Date(e.date) >= day && new Date(e.date) < next)
      .reduce((s, e) => s + e.hours, 0);
    return { label: day.toLocaleDateString("en-GB", { weekday: "short" }), hours, isToday: i === 6 };
  });
  const peak = Math.max(...week.map((d) => d.hours), 1 / 6);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Time sheet</h1>
          <p className="text-sm text-slate-500">Log the hours you spend on tasks and projects.</p>
        </div>
        <div className="flex items-end gap-6">
          {isManagerOrAdmin(user.role) && (
            <Link href="/timesheet/team" className="btn-secondary">
              Team timesheet →
            </Link>
          )}
          <div className="text-right">
            <div className="text-2xl font-bold text-sky-600">{fmtHours(rangeTotal)}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        </div>
      </div>

      <RangePicker
        basePath="/timesheet"
        rangeKey={rangeKey}
        from={from}
        to={to}
        fromParam={searchParams.from}
        toParam={searchParams.to}
      />

      {searchParams.error === "invalid" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t read that time. Try formats like <b>2h 30m</b>, <b>0:45</b>, <b>45m</b> or a
          decimal such as <b>2.5</b> (must be between 0 and 24 hours).
        </div>
      )}

      {searchParams.error === "locked" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          That week has been submitted and is locked. Withdraw the submission (or ask your manager to
          request changes) before editing it.
        </div>
      )}

      {weekMode && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            {submission?.status === "APPROVED" ? (
              <span className="badge bg-green-100 text-green-700">✓ Approved</span>
            ) : submission?.status === "SUBMITTED" ? (
              <span className="badge bg-amber-100 text-amber-700">⏳ Awaiting approval</span>
            ) : submission?.status === "REJECTED" ? (
              <span className="badge bg-red-100 text-red-700">✎ Changes requested</span>
            ) : (
              <span className="badge bg-slate-100 text-slate-600">Not submitted</span>
            )}
            <div className="text-sm text-slate-600">
              <span className="font-medium">
                {fmtDate(from)} – {fmtDate(to)}
              </span>{" "}
              · {fmtHours(rangeTotal)}
              {submission?.status === "APPROVED" && submission.reviewedBy && (
                <span className="text-slate-400">
                  {" "}
                  · approved by {submission.reviewedBy.name}
                </span>
              )}
              {submission?.status === "REJECTED" && submission.reviewNote && (
                <span className="text-red-600"> · “{submission.reviewNote}”</span>
              )}
            </div>
          </div>
          <div>
            {submission?.status === "SUBMITTED" ? (
              <form action={withdrawTimesheet}>
                <input type="hidden" name="weekStart" value={toInputDate(from)} />
                <input type="hidden" name="back" value={viewHref} />
                <button type="submit" className="btn-secondary">
                  Withdraw
                </button>
              </form>
            ) : submission?.status === "APPROVED" ? (
              <span className="text-xs text-slate-400">Locked</span>
            ) : (
              <form action={submitTimesheet}>
                <input type="hidden" name="weekStart" value={toInputDate(from)} />
                <input type="hidden" name="back" value={viewHref} />
                <button type="submit" className="btn-primary">
                  {submission?.status === "REJECTED" ? "Submit again" : "Submit week for approval"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {activeTimer && (
        <ActiveTimerBanner
          taskId={activeTimer.task.id}
          title={activeTimer.task.title}
          startedAt={activeTimer.startedAt.toISOString()}
        />
      )}

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-600">Last 7 days</h2>
        <div className="flex h-28 items-end gap-2">
          {week.map((d, i) => {
            const pct = d.hours > 0 ? Math.max(8, Math.round((d.hours / peak) * 100)) : 0;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] text-slate-500">{d.hours > 0 ? fmtHours(d.hours) : ""}</span>
                <div className="flex h-16 w-full items-end rounded bg-slate-100">
                  <div
                    className={`w-full rounded ${d.isToday ? "bg-sky-500" : "bg-sky-300"}`}
                    style={{ height: `${pct}%` }}
                  />
                </div>
                <span className={`text-[10px] ${d.isToday ? "font-semibold text-sky-600" : "text-slate-400"}`}>
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {!locked && (
      <div className="card p-5">
        <form action={createTimeEntry} className="grid items-end gap-3 md:grid-cols-6">
          <input type="hidden" name="back" value={viewHref} />
          <div>
            <label className="label">Date *</label>
            <DatePicker name="date" required defaultValue={toInputDate(new Date())} />
          </div>
          <div>
            <label className="label">From</label>
            <TimePicker name="start" placeholder="--:--" />
          </div>
          <div>
            <label className="label">To</label>
            <TimePicker name="end" placeholder="--:--" />
          </div>
          <div>
            <label className="label">Hours</label>
            <input
              name="hours"
              type="text"
              className="input"
              placeholder="or 2h 30m"
              title="Enter a From/To time range, or type hours like 2h 30m, 0:45 or 2.5"
            />
          </div>
          <div>
            <label className="label">Task</label>
            <SearchSelect
              name="taskId"
              placeholder="— None —"
              searchPlaceholder="Search tasks…"
              options={[{ value: "", label: "— None —" }, ...tasks.map((t) => ({ value: String(t.id), label: t.title }))]}
            />
          </div>
          <div>
            <label className="label">Project</label>
            <SearchSelect
              name="projectId"
              placeholder="— None —"
              searchPlaceholder="Search projects…"
              options={[{ value: "", label: "— None —" }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]}
            />
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
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Date</th>
              <th className="th">Time</th>
              <th className="th">Hours</th>
              <th className="th">Task</th>
              <th className="th">Project</th>
              <th className="th">Note</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="td py-10 text-center text-slate-400">
                  No time logged for {label.toLowerCase()}.
                </td>
              </tr>
            )}
            {entries.map((e) => {
              if (editingId === e.id && !locked) {
                // Include this entry's own task in the options even if it's not
                // in the active-tasks list (e.g. it's since been completed).
                const hasTask = e.taskId && tasks.some((t) => t.id === e.taskId);
                return (
                  <tr key={e.id} className="bg-sky-50/50 dark:bg-sky-950/20">
                    <td colSpan={7} className="td">
                      <form action={updateTimeEntry} className="grid items-end gap-3 md:grid-cols-6">
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="back" value={viewHref} />
                        <div>
                          <label className="label">Date *</label>
                          <DatePicker name="date" required defaultValue={toInputDate(e.date)} />
                        </div>
                        <div>
                          <label className="label">From</label>
                          <TimePicker name="start" defaultValue={toInputTime(e.startedAt)} placeholder="--:--" />
                        </div>
                        <div>
                          <label className="label">To</label>
                          <TimePicker name="end" defaultValue={toInputTime(e.endedAt)} placeholder="--:--" />
                        </div>
                        <div>
                          <label className="label">Hours</label>
                          <input name="hours" type="text" defaultValue={fmtHours(e.hours)} className="input" />
                        </div>
                        <div>
                          <label className="label">Task</label>
                          <SearchSelect
                            name="taskId"
                            defaultValue={e.taskId ? String(e.taskId) : ""}
                            placeholder="— None —"
                            searchPlaceholder="Search tasks…"
                            options={[
                              { value: "", label: "— None —" },
                              ...(!hasTask && e.task ? [{ value: String(e.task.id), label: e.task.title }] : []),
                              ...tasks.map((t) => ({ value: String(t.id), label: t.title })),
                            ]}
                          />
                        </div>
                        <div>
                          <label className="label">Project</label>
                          <SearchSelect
                            name="projectId"
                            defaultValue={e.projectId ? String(e.projectId) : ""}
                            placeholder="— None —"
                            searchPlaceholder="Search projects…"
                            options={[{ value: "", label: "— None —" }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]}
                          />
                        </div>
                        <div>
                          <label className="label">Note</label>
                          <input name="note" defaultValue={e.note ?? ""} className="input" />
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" className="btn-primary !py-2 text-xs">
                            Save
                          </button>
                          <Link href={viewHref} className="btn-secondary !py-2 text-xs">
                            Cancel
                          </Link>
                        </div>
                      </form>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="td">{fmtDate(e.date)}</td>
                  <td className="td text-slate-600 whitespace-nowrap">
                    {e.startedAt && e.endedAt ? fmtTimeRange(e.startedAt, e.endedAt) : "—"}
                  </td>
                  <td className="td font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {fmtHours(e.hours)}
                      {e.source === "timer" && (
                        <span
                          title="Tracked with the task timer"
                          className="badge bg-sky-100 text-sky-700 !px-1.5 !py-0 text-[10px]"
                        >
                          ⏱
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="td text-slate-600">{e.task?.title ?? "—"}</td>
                  <td className="td text-slate-600">{e.project?.name ?? "—"}</td>
                  <td className="td text-slate-600">{e.note ?? "—"}</td>
                  <td className="td text-right">
                    {locked ? (
                      <span className="text-xs text-slate-400" title="This week is locked">🔒</span>
                    ) : (
                      <div className="flex justify-end gap-3 text-xs">
                        <Link href={editHref(e.id)} className="text-sky-600 hover:underline">
                          Edit
                        </Link>
                        <form action={deleteTimeEntry}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="back" value={viewHref} />
                          <button type="submit" className="text-slate-400 hover:text-red-600">
                            Delete
                          </button>
                        </form>
                      </div>
                    )}
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
