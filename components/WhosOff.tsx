import Link from "next/link";
import { db } from "@/lib/db";
import { fmtRange, leaveType, todayIn, ymd } from "@/lib/leave";
import { holidaysFor, leaveBetween } from "@/lib/leaveData";
import { companyTimezone } from "@/lib/tz";
import UserAvatar from "@/components/UserAvatar";

/**
 * Dashboard card: today's office holiday (if any), who's on leave today, and
 * the viewer's own next leave — so nobody chases someone who's away.
 */
export default async function WhosOff({ user }: { user: { id: number; companyId: number; company: { code: string } } }) {
  const today = todayIn(companyTimezone(user.company));
  const [holidays, offToday, myNext] = await Promise.all([
    holidaysFor(user.companyId, today, today),
    leaveBetween(today, today),
    db.leave.findFirst({
      where: { userId: user.id, status: { in: ["APPROVED", "PENDING"] }, endDate: { gte: new Date(`${today}T00:00:00Z`) } },
      orderBy: { startDate: "asc" },
    }),
  ]);

  return (
    <div className="card">
      <div className="flex items-baseline justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
        <h2 className="font-semibold">🌴 Who&apos;s off today</h2>
        <Link href="/leave" className="text-sm text-sky-600 hover:underline">
          Leave
        </Link>
      </div>
      <div className="space-y-3 px-5 py-4">
        {holidays.map((h) => (
          <div key={h.id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            🎉 <b>{h.name}</b> — {h.company ? `${h.company.code} office closed` : "all offices closed"}
          </div>
        ))}
        {offToday.length === 0 ? (
          <p className="text-sm text-slate-400">Everyone&apos;s in today.</p>
        ) : (
          <ul className="space-y-2">
            {offToday.map((l) => (
              <li key={l.id} className="flex items-center gap-2 text-sm">
                <UserAvatar user={l.user} size={26} />
                <span className="flex-1 truncate">
                  <Link href={`/people/${l.user.id}`} className="font-medium hover:text-sky-700">
                    {l.user.name}
                  </Link>{" "}
                  <span className="text-slate-400">
                    {leaveType(l.type).emoji} {l.halfDay ? "half day" : ymd(l.endDate) === today ? "back tomorrow" : `back after ${fmtRange(l.endDate, l.endDate)}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {myNext && (
          <p className="border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-700">
            Your next leave: <b>{fmtRange(myNext.startDate, myNext.endDate)}</b>
            {myNext.status === "PENDING" && <span className="text-amber-600"> (waiting for approval)</span>}
          </p>
        )}
      </div>
    </div>
  );
}
