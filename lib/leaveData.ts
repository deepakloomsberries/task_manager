import { db } from "@/lib/db";
import { countLeaveDays, eachDay, parseYmd, weekendSet, ymd } from "@/lib/leave";

/** Holidays that apply to an office (its own plus company-wide ones) in a date range. */
export async function holidaysFor(companyId: number | null, from: string, to: string) {
  return db.holiday.findMany({
    where: {
      date: { gte: parseYmd(from)!, lte: parseYmd(to)! },
      ...(companyId ? { OR: [{ companyId: null }, { companyId }] } : {}),
    },
    include: { company: { select: { code: true } } },
    orderBy: { date: "asc" },
  });
}

/** Holiday days for an office in a range, as a set of "YYYY-MM-DD". */
export async function holidaySet(companyId: number | null, from: string, to: string): Promise<Set<string>> {
  return new Set((await holidaysFor(companyId, from, to)).map((h) => ymd(h.date)));
}

/** Leave (default: approved only) overlapping a date range, optionally for some people. */
export async function leaveBetween(from: string, to: string, opts: { userIds?: number[]; statuses?: string[] } = {}) {
  return db.leave.findMany({
    where: {
      status: { in: opts.statuses ?? ["APPROVED"] },
      startDate: { lte: parseYmd(to)! },
      endDate: { gte: parseYmd(from)! },
      ...(opts.userIds ? { userId: { in: opts.userIds } } : {}),
    },
    include: { user: { select: { id: true, name: true, avatarPath: true, companyId: true } } },
    orderBy: { startDate: "asc" },
  });
}

/** Ids of people on approved leave on a given day. */
export async function usersOnLeave(day: string): Promise<Set<number>> {
  return new Set((await leaveBetween(day, day)).map((l) => l.userId));
}

/**
 * Working days a leave would use for this person — weekends and holidays of
 * their own office aren't counted.
 */
export async function workingDaysFor(userId: number, start: string, end: string, halfDay: boolean) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { company: true } });
  const holidays = await holidaySet(user.companyId, start, end);
  return countLeaveDays({ start, end, halfDay }, weekendSet(user.company.weekendDays), holidays);
}

/** Days off (approved leave + office holidays) per person across a range, keyed "userId:YYYY-MM-DD". */
export async function daysOffMap(people: { id: number; companyId: number }[], from: string, to: string) {
  const [leaves, holidays] = await Promise.all([
    leaveBetween(from, to, { userIds: people.map((p) => p.id) }),
    holidaysFor(null, from, to),
  ]);
  const off = new Map<string, { kind: "leave" | "holiday"; label: string; type?: string; halfDay?: boolean }>();
  for (const p of people) {
    for (const h of holidays) {
      if (h.companyId === null || h.companyId === p.companyId) off.set(`${p.id}:${ymd(h.date)}`, { kind: "holiday", label: h.name });
    }
  }
  for (const l of leaves) {
    for (const d of eachDay(ymd(l.startDate), ymd(l.endDate))) {
      if (d < from || d > to) continue;
      off.set(`${l.userId}:${d}`, { kind: "leave", label: "On leave", type: l.type, halfDay: l.halfDay });
    }
  }
  return off;
}
