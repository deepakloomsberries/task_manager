import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { TASK_PRIORITIES, lookup } from "@/lib/ui";
import CalendarGrid, { type CalTask } from "@/components/CalendarGrid";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
      deletedAt: null,
      ...(mine ? { assigneeId: user.id } : {}),
    },
    include: { assignee: true },
    orderBy: { priority: "desc" },
  });

  const isManager = isManagerOrAdmin(user.role);
  const calTasks: CalTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    badge: lookup(TASK_PRIORITIES, t.priority).badge,
    assigneeName: t.assignee?.name ?? null,
    day: new Date(t.dueDate!).getDate(),
    editable: isManager || t.assigneeId === user.id || t.createdById === user.id,
  }));

  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const todayDay =
    year === now.getFullYear() && month === now.getMonth() ? now.getDate() : null;
  const scopeParam = mine ? "" : "&scope=all";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-sm text-slate-500">Tasks by due date · drag a task to reschedule it.</p>
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

      <CalendarGrid year={year} month={month} todayDay={todayDay} tasks={calTasks} />
    </div>
  );
}
