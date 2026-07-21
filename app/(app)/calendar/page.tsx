import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { TASK_PRIORITIES, lookup } from "@/lib/ui";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { m?: string; scope?: string };
}) {
  const user = await requireUser();

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  const match = searchParams.m?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]) - 1;
  }

  const mine = searchParams.scope !== "all";
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);

  const tasks = await db.task.findMany({
    where: {
      dueDate: { gte: monthStart, lt: monthEnd },
      ...(mine ? { assigneeId: user.id } : {}),
    },
    include: { assignee: true, project: true },
    orderBy: { priority: "desc" },
  });

  const byDay = new Map<number, typeof tasks>();
  for (const t of tasks) {
    const d = new Date(t.dueDate!).getDate();
    byDay.set(d, [...(byDay.get(d) ?? []), t]);
  }

  const firstWeekday = (monthStart.getDay() + 6) % 7; // Monday-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const isToday = (d: number) =>
    year === now.getFullYear() && month === now.getMonth() && d === now.getDate();
  const scopeParam = mine ? "" : "&scope=all";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-slate-500">Tasks by due date.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
            <Link
              href={`/calendar?m=${fmt(monthStart)}`}
              className={`rounded-md px-3 py-1 ${mine ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              My tasks
            </Link>
            <Link
              href={`/calendar?m=${fmt(monthStart)}&scope=all`}
              className={`rounded-md px-3 py-1 ${!mine ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              Everyone
            </Link>
          </div>
          <Link href={`/calendar?m=${fmt(prev)}${scopeParam}`} className="btn-secondary !px-3">
            ←
          </Link>
          <span className="w-40 text-center font-semibold">
            {MONTHS[month]} {year}
          </span>
          <Link href={`/calendar?m=${fmt(next)}${scopeParam}`} className="btn-secondary !px-3">
            →
          </Link>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="grid min-w-[840px] grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {d}
            </div>
          ))}
        </div>
        <div className="grid min-w-[840px] grid-cols-7">
          {cells.map((day, i) => (
            <div
              key={i}
              className={`min-h-28 border-b border-r border-slate-100 p-2 ${
                day === null ? "bg-slate-50/50" : ""
              }`}
            >
              {day !== null && (
                <>
                  <div
                    className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                      isToday(day) ? "bg-sky-600 text-white" : "text-slate-500"
                    }`}
                  >
                    {day}
                  </div>
                  <div className="space-y-1">
                    {(byDay.get(day) ?? []).slice(0, 3).map((t) => {
                      const priority = lookup(TASK_PRIORITIES, t.priority);
                      return (
                        <Link
                          key={t.id}
                          href={`/tasks/${t.id}`}
                          title={`${t.title}${t.assignee ? ` — ${t.assignee.name}` : ""}`}
                          className={`block truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            t.status === "DONE"
                              ? "bg-green-50 text-green-700 line-through"
                              : priority.badge
                          }`}
                        >
                          {t.title}
                        </Link>
                      );
                    })}
                    {(byDay.get(day)?.length ?? 0) > 3 && (
                      <div className="px-1.5 text-[10px] text-slate-400">
                        +{byDay.get(day)!.length - 3} more
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
