import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import RangePicker from "@/components/RangePicker";
import UserAvatar from "@/components/UserAvatar";
import { approveTimesheet, rejectTimesheet } from "@/lib/actions/time";
import { fmtDate, fmtHours, toInputDate } from "@/lib/ui";
import { rangeBounds } from "@/lib/timerange";

export const dynamic = "force-dynamic";

export default async function TeamTimesheetPage({
  searchParams,
}: {
  searchParams: { range?: string; from?: string; to?: string; user?: string };
}) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/timesheet");

  const { from, to, label, key } = rangeBounds(searchParams.range ?? "30d", searchParams.from, searchParams.to);

  const [users, entries, pending] = await Promise.all([
    db.user.findMany({
      where: { active: true },
      include: { department: true },
      orderBy: { name: "asc" },
    }),
    db.timeEntry.findMany({
      where: { date: { gte: from, lte: to } },
      include: {
        user: { select: { id: true, name: true, avatarPath: true } },
        task: true,
        project: true,
      },
      orderBy: { date: "desc" },
    }),
    db.timesheetSubmission.findMany({
      where: { status: "SUBMITTED" },
      include: { user: { select: { id: true, name: true, avatarPath: true } } },
      orderBy: { submittedAt: "asc" },
    }),
  ]);

  // Per-person totals for the selected window.
  const stat = new Map<number, { hours: number; count: number }>();
  for (const e of entries) {
    const s = stat.get(e.userId) ?? { hours: 0, count: 0 };
    s.hours += e.hours;
    s.count += 1;
    stat.set(e.userId, s);
  }
  const rows = users
    .map((u) => ({ user: u, hours: stat.get(u.id)?.hours ?? 0, count: stat.get(u.id)?.count ?? 0 }))
    .sort((a, b) => b.hours - a.hours);
  const grandTotal = entries.reduce((s, e) => s + e.hours, 0);
  const maxHours = Math.max(...rows.map((r) => r.hours), 1 / 6);
  const contributors = rows.filter((r) => r.hours > 0).length;

  // Preserve the active range across drilldown / export links.
  const viewParams = new URLSearchParams();
  if (key !== "30d") viewParams.set("range", key);
  if (key === "custom") {
    if (searchParams.from) viewParams.set("from", searchParams.from);
    if (searchParams.to) viewParams.set("to", searchParams.to);
  }
  const viewQuery = viewParams.toString();
  const backHref = viewQuery ? `/timesheet/team?${viewQuery}` : "/timesheet/team";
  const rowHref = (id: number) => {
    const q = new URLSearchParams(viewQuery);
    q.set("user", String(id));
    return `/timesheet/team?${q.toString()}`;
  };
  const exportBase = `/api/export/timesheet?from=${toInputDate(from)}&to=${toInputDate(to)}`;

  // Optional per-person drilldown.
  const selectedId = searchParams.user ? Number(searchParams.user) : null;
  const selected = selectedId ? users.find((u) => u.id === selectedId) : null;
  const selectedEntries = selectedId ? entries.filter((e) => e.userId === selectedId) : [];
  const byProject = new Map<string, number>();
  for (const e of selectedEntries) {
    const name = e.project?.name ?? e.task?.title ?? "Unassigned";
    byProject.set(name, (byProject.get(name) ?? 0) + e.hours);
  }
  const projectRows = Array.from(byProject.entries()).sort((a, b) => b[1] - a[1]);
  const selectedTotal = selectedEntries.reduce((s, e) => s + e.hours, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/timesheet" className="text-sm text-slate-500 hover:underline">
            ← My time sheet
          </Link>
          <h1 className="text-2xl font-bold">Team time sheet</h1>
          <p className="text-sm text-slate-500">
            Time logged by everyone — {label.toLowerCase()}.
          </p>
        </div>
        <div className="flex items-end gap-4">
          <a href={exportBase} className="btn-secondary !py-1.5 text-xs">
            ⇩ Export all (CSV)
          </a>
          <div className="text-right">
            <div className="text-2xl font-bold text-sky-600">{fmtHours(grandTotal)}</div>
            <div className="text-xs text-slate-500">
              {contributors} {contributors === 1 ? "person" : "people"}
            </div>
          </div>
        </div>
      </div>

      <RangePicker
        basePath="/timesheet/team"
        rangeKey={key}
        from={from}
        to={to}
        fromParam={searchParams.from}
        toParam={searchParams.to}
      />

      {pending.length > 0 && (
        <div className="card border-amber-200 dark:border-amber-900/60">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="flex items-center gap-2 font-semibold">
              ⏳ Pending approvals
              <span className="badge bg-amber-100 text-amber-700">{pending.length}</span>
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {pending.map((s) => {
              const weekEnd = new Date(s.weekStart);
              weekEnd.setDate(weekEnd.getDate() + 6);
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <UserAvatar user={s.user} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{s.user.name}</div>
                    <div className="text-xs text-slate-500">
                      Week of {fmtDate(s.weekStart)} – {fmtDate(weekEnd)} · {fmtHours(s.totalHours)} ·
                      submitted {fmtDate(s.submittedAt)}
                    </div>
                  </div>
                  <form action={approveTimesheet}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="back" value={backHref} />
                    <button type="submit" className="btn-primary !py-1.5 text-xs">
                      Approve
                    </button>
                  </form>
                  <form action={rejectTimesheet} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="back" value={backHref} />
                    <input
                      name="note"
                      placeholder="Reason (optional)"
                      className="input !w-40 !py-1.5 text-xs"
                    />
                    <button type="submit" className="btn-secondary !py-1.5 text-xs">
                      Request changes
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Employee</th>
              <th className="th">Department</th>
              <th className="th">Entries</th>
              <th className="th w-1/3">Hours</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const pct = Math.round((r.hours / maxHours) * 100);
              return (
                <tr key={r.user.id} className={`hover:bg-slate-50 ${r.hours === 0 ? "opacity-60" : ""}`}>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <UserAvatar user={r.user} size={28} presence={r.user.lastSeenAt} />
                      <span className="font-medium">{r.user.name}</span>
                    </div>
                  </td>
                  <td className="td text-slate-600">{r.user.department?.name ?? "—"}</td>
                  <td className="td text-slate-600">{r.count}</td>
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-16 shrink-0 text-right text-sm font-medium">
                        {fmtHours(r.hours)}
                      </span>
                    </div>
                  </td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-3 text-xs">
                      <Link
                        href={rowHref(r.user.id)}
                        className={`hover:underline ${selectedId === r.user.id ? "font-semibold text-sky-700" : "text-sky-600"}`}
                      >
                        {selectedId === r.user.id ? "Viewing" : "View"}
                      </Link>
                      <a href={`${exportBase}&user=${r.user.id}`} className="text-slate-400 hover:text-sky-600">
                        Export
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <UserAvatar user={selected} size={36} presence={selected.lastSeenAt} />
              <div>
                <h2 className="font-semibold leading-tight">{selected.name}</h2>
                <p className="text-xs text-slate-500">
                  {fmtHours(selectedTotal)} across {selectedEntries.length}{" "}
                  {selectedEntries.length === 1 ? "entry" : "entries"} · {label.toLowerCase()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a href={`${exportBase}&user=${selected.id}`} className="btn-secondary !py-1.5 text-xs">
                ⇩ Export
              </a>
              <Link href={`/timesheet/team?${viewQuery}`} className="text-sm text-slate-500 hover:underline">
                Close
              </Link>
            </div>
          </div>

          {projectRows.length > 0 && (
            <div className="mb-5 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                By project
              </div>
              {projectRows.map(([name, hours]) => {
                const pct = selectedTotal > 0 ? Math.round((hours / selectedTotal) * 100) : 0;
                return (
                  <div key={name} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0 truncate text-slate-600">{name}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-16 shrink-0 text-right font-medium">{fmtHours(hours)}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Hours</th>
                  <th className="th">Task</th>
                  <th className="th">Project</th>
                  <th className="th">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedEntries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="td py-8 text-center text-slate-400">
                      No time logged in this window.
                    </td>
                  </tr>
                )}
                {selectedEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="td">{fmtDate(e.date)}</td>
                    <td className="td font-medium">{fmtHours(e.hours)}</td>
                    <td className="td text-slate-600">{e.task?.title ?? "—"}</td>
                    <td className="td text-slate-600">{e.project?.name ?? "—"}</td>
                    <td className="td text-slate-600">{e.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
