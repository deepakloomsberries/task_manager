import { db } from "@/lib/db";
import { weekStartOf } from "@/lib/timerange";
import { fmtHours } from "@/lib/ui";

export const REMINDER_PREFIX = "⏰ Timesheet reminder";
export const REMINDER_LINK = "/timesheet?range=week";

export type TimesheetReminder = {
  userId: number;
  name: string;
  email: string;
  emailNotifications: boolean;
  hours: number;
  message: string;
};

/**
 * Who should get the end-of-week "submit your timesheet" nudge: active people
 * in the given roles whose current week isn't submitted or approved yet, and
 * who haven't already been reminded today (so re-running the cron is safe).
 * A rejected week counts as not submitted — they need to resubmit.
 */
export async function findTimesheetReminders(
  now: Date = new Date(),
  roles: string[] = ["EMPLOYEE", "MANAGER"]
): Promise<TimesheetReminder[]> {
  const weekStart = weekStartOf(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [users, subs, hours, alreadyReminded] = await Promise.all([
    db.user.findMany({
      where: { active: true, role: { in: roles } },
      select: { id: true, name: true, email: true, emailNotifications: true },
    }),
    db.timesheetSubmission.findMany({
      where: { weekStart, status: { in: ["SUBMITTED", "APPROVED"] } },
      select: { userId: true },
    }),
    db.timeEntry.groupBy({
      by: ["userId"],
      where: { date: { gte: weekStart, lt: weekEnd } },
      _sum: { hours: true },
    }),
    db.notification.findMany({
      where: { createdAt: { gte: todayStart }, message: { startsWith: REMINDER_PREFIX } },
      select: { userId: true },
    }),
  ]);

  const done = new Set(subs.map((s) => s.userId));
  const reminded = new Set(alreadyReminded.map((n) => n.userId));
  const logged = new Map(hours.map((h) => [h.userId, h._sum.hours ?? 0]));

  return users
    .filter((u) => !done.has(u.id) && !reminded.has(u.id))
    .map((u) => {
      const h = logged.get(u.id) ?? 0;
      const message =
        h > 0
          ? `${REMINDER_PREFIX}: you've logged ${fmtHours(h)} this week — check it and submit it for approval.`
          : `${REMINDER_PREFIX}: you haven't logged any time this week yet — add your hours and submit them.`;
      return { userId: u.id, name: u.name, email: u.email, emailNotifications: u.emailNotifications, hours: h, message };
    });
}
