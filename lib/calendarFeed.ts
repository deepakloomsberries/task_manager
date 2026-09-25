import { db } from "@/lib/db";
import { LEAVE_TYPES, ymd } from "@/lib/leave";
import { buildCalendar, type IcsEvent } from "@/lib/ics";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/ui";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const DAY = 86400000;
const host = () => {
  try {
    return new URL(APP_URL).hostname;
  } catch {
    return "tasks.local";
  }
};

/**
 * The events in someone's personal calendar feed: tasks they own or work on
 * (on their due date), their leave, and their office's holidays. Daily
 * recurring occurrences are left out — they'd fill every single day.
 */
export async function feedEvents(user: { id: number; companyId: number }, now: Date = new Date()): Promise<IcsEvent[]> {
  const from = new Date(now.getTime() - 60 * DAY);
  const to = new Date(now.getTime() + 400 * DAY);
  const recentlyDone = new Date(now.getTime() - 30 * DAY);

  const [tasks, leaves, holidays] = await Promise.all([
    db.task.findMany({
      where: {
        deletedAt: null,
        seriesId: null,
        dueDate: { gte: from, lte: to },
        OR: [{ assigneeId: user.id }, { collaborators: { some: { userId: user.id } } }],
        AND: [{ OR: [{ status: { not: "DONE" } }, { completedAt: { gte: recentlyDone } }] }],
      },
      include: { project: { select: { name: true } } },
      take: 2000,
    }),
    db.leave.findMany({
      where: { userId: user.id, status: { in: ["APPROVED", "PENDING"] }, endDate: { gte: from } },
    }),
    db.holiday.findMany({
      where: { date: { gte: from, lte: to }, OR: [{ companyId: null }, { companyId: user.companyId }] },
    }),
  ]);

  const label = (list: readonly { value: string; label: string }[], v: string) => list.find((x) => x.value === v)?.label ?? v;
  const events: IcsEvent[] = [];
  for (const t of tasks) {
    const done = t.status === "DONE";
    events.push({
      uid: `task-${t.id}@${host()}`,
      start: ymd(new Date(Date.UTC(t.dueDate!.getFullYear(), t.dueDate!.getMonth(), t.dueDate!.getDate()))),
      summary: `${done ? "✓ " : ""}TM-${t.id} · ${t.title}`,
      description: [
        t.project ? `Project: ${t.project.name}` : null,
        `Status: ${label(TASK_STATUSES, t.status)} · Priority: ${label(TASK_PRIORITIES, t.priority)}`,
        `${APP_URL}/tasks/${t.id}`,
      ]
        .filter(Boolean)
        .join("\n"),
      url: `${APP_URL}/tasks/${t.id}`,
      updated: t.updatedAt,
    });
  }
  for (const l of leaves) {
    const type = LEAVE_TYPES.find((x) => x.value === l.type) ?? LEAVE_TYPES[0];
    events.push({
      uid: `leave-${l.id}@${host()}`,
      start: ymd(l.startDate),
      end: ymd(l.endDate),
      summary: `${type.emoji} ${type.label}${l.halfDay ? " (half day)" : ""}${l.status === "PENDING" ? " — pending approval" : ""}`,
      description: `${APP_URL}/leave`,
      busy: true,
      status: l.status === "PENDING" ? "TENTATIVE" : "CONFIRMED",
    });
  }
  for (const h of holidays) {
    events.push({ uid: `holiday-${h.id}@${host()}`, start: ymd(h.date), summary: `🎉 ${h.name}`, busy: true });
  }
  return events;
}

export async function feedFor(token: string, now: Date = new Date()): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const user = await db.user.findUnique({ where: { calendarToken: token }, select: { id: true, name: true, active: true, companyId: true } });
  if (!user || !user.active) return null;
  return buildCalendar(`Looms & Berries — ${user.name}`, await feedEvents(user, now), now);
}
