import { db } from "@/lib/db";
import { notifyLeaveAnnouncement } from "@/lib/mail";
import { fmtDays, fmtRange, todayIn, ymd } from "@/lib/leave";
import { companyTimezone } from "@/lib/tz";

/**
 * Who should hear that someone's leave was booked or cancelled: every other
 * active person with email on. Returns null when there's nothing to announce
 * (leave already over).
 */
export async function leaveAnnouncementFor(leaveId: number, now: Date = new Date()) {
  const leave = await db.leave.findUnique({
    where: { id: leaveId },
    include: { user: { include: { company: true } } },
  });
  if (!leave) return null;
  if (ymd(leave.endDate) < todayIn(companyTimezone(leave.user.company), now)) return null;
  const people = await db.user.findMany({
    where: { active: true, emailNotifications: true, id: { not: leave.userId } },
    select: { email: true },
  });
  return {
    to: people.map((p) => p.email),
    person: leave.user.name,
    office: leave.user.company.code,
    range: fmtRange(leave.startDate, leave.endDate),
    days: fmtDays(leave.days),
  };
}

/** Emails the team that someone will be on leave (or no longer is). Never throws. */
export async function announceLeave(leaveId: number, cancelled = false) {
  try {
    const a = await leaveAnnouncementFor(leaveId);
    if (a) notifyLeaveAnnouncement({ ...a, cancelled });
  } catch (e) {
    console.error("[leave announcement failed]", e);
  }
}
