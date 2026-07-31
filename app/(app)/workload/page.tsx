import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import UserAvatar from "@/components/UserAvatar";
import { fmtHours } from "@/lib/ui";
import { weekStartOf } from "@/lib/timerange";

export const dynamic = "force-dynamic";

const DAY = 86400000;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Colour a day cell by how many tasks are due that day. */
function loadClass(n: number) {
  if (n <= 0) return "bg-slate-50 text-slate-300 dark:bg-slate-800";
  if (n <= 2) return "bg-sky-100 text-sky-700";
  if (n <= 4) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function toDateParam(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function WorkloadPage({ searchParams }: { searchParams: { start?: string } }) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/dashboard");

  const weekStart = weekStartOf(searchParams.start ? new Date(searchParams.start) : new Date());
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY);
  const prev = toDateParam(new Date(weekStart.getTime() - 7 * DAY));
  const next = toDateParam(new Date(weekStart.getTime() + 7 * DAY));

  const [users, tasks, entries] = await Promise.all([
    db.user.findMany({
      where: { active: true },
      include: { department: true },
      orderBy: { name: "asc" },
    }),
    // Open, assigned, dated tasks up to the end of this week (covers overdue + this week).
    db.task.findMany({
      where: {
        deletedAt: null,
        status: { not: "DONE" },
        assigneeId: { not: null },
        dueDate: { not: null, lt: weekEnd },
      },
      select: { id: true, assigneeId: true, dueDate: true },
    }),
    db.timeEntry.findMany({
      where: { date: { gte: weekStart, lt: weekEnd } },
      select: { userId: true, hours: true },
    }),
  ]);

  const hoursByUser = new Map<number, number>();
  for (const e of entries) hoursByUser.set(e.userId, (hoursByUser.get(e.userId) ?? 0) + e.hours);

  const rows = users.map((u) => {
    const perDay = [0, 0, 0, 0, 0, 0, 0];
    let overdue = 0;
    for (const t of tasks) {
      if (t.assigneeId !== u.id || !t.dueDate) continue;
      const due = new Date(t.dueDate);
      if (due < weekStart) {
        overdue += 1;
      } else {
        const idx = Math.floor((due.getTime() - weekStart.getTime()) / DAY);
        if (idx >= 0 && idx < 7) perDay[idx] += 1;
      }
    }
    const dueThisWeek = perDay.reduce((a, b) => a + b, 0);
    const maxDay = Math.max(...perDay);
    const load = dueThisWeek >= 10 || maxDay >= 5 ? "heavy" : dueThisWeek >= 5 ? "busy" : dueThisWeek > 0 ? "ok" : "free";
    return {
      user: u,
      perDay,
      dueThisWeek,
      overdue,
      hours: hoursByUser.get(u.id) ?? 0,
      load,
    };
  });

  const teamDue = rows.reduce((s, r) => s + r.dueThisWeek, 0);
  const heavyCount = rows.filter((r) => r.load === "heavy").length;
  const isThisWeek = weekStart.getTime() === weekStartOf(new Date()).getTime();
  const weekLabel = `${weekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – ${new Date(
    weekEnd.getTime() - DAY
  ).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Workload</h1>
          <p className="text-sm text-slate-500">
            Open tasks due per person this week — spot who&apos;s overloaded and rebalance.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-sky-600">{teamDue}</div>
          <div className="text-xs text-slate-500">
            tasks due · {heavyCount} overloaded
          </div>
        </div>
      </div>

      {/* Week navigator */}
      <div className="card flex items-center justify-between p-3">
        <Link href={`/workload?start=${prev}`} className="btn-secondary !py-1.5 text-xs">← Prev week</Link>
        <div className="text-sm font-medium">
          {isThisWeek ? "This week" : "Week of"} · {weekLabel}
        </div>
        <div className="flex gap-2">
          {!isThisWeek && (
            <Link href="/workload" className="btn-secondary !py-1.5 text-xs">Today</Link>
          )}
          <Link href={`/workload?start=${next}`} className="btn-secondary !py-1.5 text-xs">Next week →</Link>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px]">
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
              <th className="th text-center">Due</th>
              <th className="th text-center">Overdue</th>
              <th className="th text-center">Hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.user.id} className="hover:bg-slate-50">
                <td className="td">
                  <Link href={`/tasks?assignee=${r.user.id}&open=1`} className="flex items-center gap-2 hover:text-sky-700">
                    <UserAvatar user={r.user} size={28} presence={r.user.lastSeenAt} />
                    <span>
                      <span className="font-medium">{r.user.name}</span>
                      {r.load === "heavy" && (
                        <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          Overloaded
                        </span>
                      )}
                      <span className="block text-xs text-slate-400">{r.user.department?.name ?? "—"}</span>
                    </span>
                  </Link>
                </td>
                {r.perDay.map((n, i) => (
                  <td key={i} className="td text-center">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold ${loadClass(n)}`}>
                      {n > 0 ? n : ""}
                    </span>
                  </td>
                ))}
                <td className="td text-center font-medium">{r.dueThisWeek}</td>
                <td className={`td text-center ${r.overdue > 0 ? "font-semibold text-red-600" : "text-slate-400"}`}>
                  {r.overdue || "—"}
                </td>
                <td className="td text-center text-slate-600">{r.hours > 0 ? fmtHours(r.hours) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-1 text-[11px] text-slate-500">
        <span>Tasks due per day:</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-sky-100" /> 1–2</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-amber-100" /> 3–4</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-red-100" /> 5+</span>
      </div>
    </div>
  );
}
