import { db } from "@/lib/db";
import { PRESENCE, PRESENCE_SELECT, chosenPresence, resolvePresence, type PresenceKey } from "@/lib/presence";
import { companyTimezone } from "@/lib/tz";
import { todayIn } from "@/lib/leave";

export type TeamMember = {
  id: number;
  name: string;
  jobTitle: string | null;
  avatarPath: string | null;
  office: string;
  tz: string;
  key: PresenceKey;
  label: string;
  message: string | null;
  /** When they were last looking at the app (hidden for "appear offline"). */
  lastSeen: string | null;
  me: boolean;
};

/** Order people appear in: around first, then on leave, then offline. */
export const PRESENCE_ORDER: PresenceKey[] = ["AVAILABLE", "BUSY", "MEETING", "DND", "AWAY", "LEAVE", "OFFLINE"];

/** Everyone active with their live status, for the header strip and team panel. */
export async function loadTeamPresence(viewerId: number, now = new Date()): Promise<TeamMember[]> {
  const people = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, jobTitle: true, avatarPath: true, company: { select: { code: true } }, ...PRESENCE_SELECT },
    orderBy: { name: "asc" },
  });
  // Approved leave today (in each person's own office day).
  const days = Array.from(new Set(people.map((p) => todayIn(companyTimezone(p.company), now))));
  const leave = await db.leave.findMany({
    where: {
      status: "APPROVED",
      userId: { in: people.map((p) => p.id) },
      OR: days.map((d) => ({ startDate: { lte: new Date(`${d}T00:00:00Z`) }, endDate: { gte: new Date(`${d}T00:00:00Z`) } })),
    },
    select: { userId: true, startDate: true, endDate: true, user: { select: { company: { select: { code: true } } } } },
  });
  const onLeave = new Set(
    leave
      .filter((l) => {
        const d = new Date(`${todayIn(companyTimezone(l.user.company), now)}T00:00:00Z`);
        return l.startDate <= d && l.endDate >= d;
      })
      .map((l) => l.userId)
  );
  const t = now.getTime();
  return people
    .map((p) => {
      const r = resolvePresence({ ...p, onLeave: onLeave.has(p.id) }, t);
      const hidden = chosenPresence(p, t) === "OFFLINE";
      return {
        id: p.id,
        name: p.name,
        jobTitle: p.jobTitle,
        avatarPath: p.avatarPath,
        office: p.company.code,
        tz: companyTimezone(p.company),
        key: r.key,
        label: PRESENCE[r.key].label,
        message: r.message,
        lastSeen: hidden ? null : (p.lastSeenAt?.toISOString() ?? null),
        me: p.id === viewerId,
      };
    })
    .sort((a, b) => PRESENCE_ORDER.indexOf(a.key) - PRESENCE_ORDER.indexOf(b.key) || (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "") || a.name.localeCompare(b.name));
}
