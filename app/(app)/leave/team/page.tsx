import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { reviewLeave } from "@/lib/actions/leave";
import { LEAVE_STATUSES, eachDay, fmtDays, fmtRange, leaveType, todayIn, weekday, weekendSet, ymd } from "@/lib/leave";
import { holidaysFor, leaveBetween } from "@/lib/leaveData";
import { companyTimezone } from "@/lib/tz";
import UserAvatar from "@/components/UserAvatar";
import FlashToast from "@/components/FlashToast";
import LeaveTabs from "../LeaveTabs";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 21;
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

export default async function TeamLeavePage(props: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/leave");

  const today = todayIn(companyTimezone(user.company));
  const days = eachDay(today, ymd(new Date(new Date(`${today}T00:00:00Z`).getTime() + (WINDOW_DAYS - 1) * 86400000)));
  const from = days[0];
  const to = days[days.length - 1];

  const [pending, upcoming, holidays, recent] = await Promise.all([
    db.leave.findMany({
      where: { status: "PENDING" },
      include: { user: { select: { id: true, name: true, avatarPath: true, company: { select: { code: true } } } } },
      orderBy: { startDate: "asc" },
    }),
    leaveBetween(from, to, { statuses: ["APPROVED", "PENDING"] }),
    holidaysFor(null, from, to),
    db.leave.findMany({
      where: { status: { in: ["APPROVED", "REJECTED"] }, reviewedAt: { not: null } },
      include: { user: { select: { name: true } }, reviewedBy: { select: { name: true } } },
      orderBy: { reviewedAt: "desc" },
      take: 10,
    }),
  ]);

  // Who's off, one row per person with any leave in the window.
  const people = new Map<number, { name: string; avatarPath: string | null; companyId: number; cells: Map<string, (typeof upcoming)[number]> }>();
  for (const l of upcoming) {
    const row = people.get(l.userId) ?? { name: l.user.name, avatarPath: l.user.avatarPath, companyId: l.user.companyId, cells: new Map() };
    for (const d of eachDay(ymd(l.startDate), ymd(l.endDate))) if (d >= from && d <= to) row.cells.set(d, l);
    people.set(l.userId, row);
  }
  const companies = await db.company.findMany({ select: { id: true, code: true, weekendDays: true } });
  const weekendOf = new Map(companies.map((c) => [c.id, weekendSet(c.weekendDays)]));
  const holidayOn = (d: string, companyId: number) => holidays.find((h) => ymd(h.date) === d && (h.companyId === null || h.companyId === companyId));
  const allOfficeHoliday = (d: string) => holidays.find((h) => ymd(h.date) === d && h.companyId === null);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {searchParams.ok && <FlashToast message={searchParams.ok === "approved" ? "Leave approved." : "Leave declined."} />}
      <div>
        <h1 className="text-2xl font-bold">Leave &amp; holidays</h1>
        <p className="text-sm text-slate-500">Approve requests and see who&apos;s off over the next three weeks.</p>
      </div>
      <LeaveTabs active="team" isManager pending={pending.filter((p) => p.userId !== user.id).length} />

      {searchParams.error === "own" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">You can&apos;t approve your own leave.</div>
      )}

      <section className="card" aria-label="Pending requests">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 className="font-semibold">⏳ Waiting for approval</h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">Nothing to approve. 🎉</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {pending.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <UserAvatar user={l.user} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {l.user.name} <span className="text-xs font-normal text-slate-400">{l.user.company.code}</span>
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    {leaveType(l.type).emoji} {leaveType(l.type).label} · <b>{fmtRange(l.startDate, l.endDate)}</b> ·{" "}
                    {l.halfDay ? "half day" : fmtDays(l.days)}
                    {l.reason && <span className="text-slate-400"> — “{l.reason}”</span>}
                  </div>
                </div>
                {l.userId === user.id ? (
                  <span className="text-xs text-slate-400">Your own request — another manager approves it</span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={reviewLeave}>
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <button type="submit" className="btn-primary !py-1.5 text-xs">
                        ✓ Approve
                      </button>
                    </form>
                    <form action={reviewLeave} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <input name="note" placeholder="Reason (optional)" className="input !w-40 !py-1.5 text-xs" />
                      <button type="submit" className="btn-secondary !py-1.5 text-xs">
                        Decline
                      </button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-x-auto" aria-label="Who's off">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 className="font-semibold">📅 Who&apos;s off — next {WINDOW_DAYS} days</h2>
          <span className="text-xs text-slate-400">Faded = still pending · grey columns = weekend / holiday</span>
        </div>
        {people.size === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">Nobody is off in the next three weeks.</p>
        ) : (
          <table className="w-full min-w-[900px] text-center text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                <th className="th text-left">Person</th>
                {days.map((d) => {
                  const h = allOfficeHoliday(d);
                  return (
                    <th key={d} className={`px-0.5 py-2 font-medium ${d === today ? "text-sky-600" : "text-slate-500"}`} title={h?.name}>
                      <div>{DOW[weekday(d)]}</div>
                      <div className="font-normal">{Number(d.slice(8))}</div>
                      {h && <div>🎉</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {Array.from(people.entries()).map(([id, p]) => (
                <tr key={id}>
                  <td className="td whitespace-nowrap text-left">
                    <Link href={`/people/${id}`} className="flex items-center gap-2 font-medium hover:text-sky-700">
                      <UserAvatar user={{ id, name: p.name, avatarPath: p.avatarPath }} size={24} />
                      {p.name}
                    </Link>
                  </td>
                  {days.map((d) => {
                    const l = p.cells.get(d);
                    const off = weekendOf.get(p.companyId)?.has(weekday(d)) || !!holidayOn(d, p.companyId);
                    return (
                      <td key={d} className={`px-0.5 py-1.5 ${off ? "bg-slate-50 dark:bg-slate-800/60" : ""}`}>
                        {l && !off && (
                          <span
                            className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md ${leaveType(l.type).badge} ${l.status === "PENDING" ? "opacity-50 ring-1 ring-dashed ring-amber-400" : ""}`}
                            title={`${leaveType(l.type).label} · ${fmtRange(l.startDate, l.endDate)} · ${LEAVE_STATUSES[l.status as keyof typeof LEAVE_STATUSES]?.label}`}
                          >
                            {l.halfDay ? "½" : leaveType(l.type).emoji}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {recent.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Recent decisions</h2>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-700">
            {recent.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <b>{l.user.name}</b> · {leaveType(l.type).label} · {fmtRange(l.startDate, l.endDate)}
                </span>
                <span className="text-xs text-slate-500">
                  <span className={`badge ${LEAVE_STATUSES[l.status as keyof typeof LEAVE_STATUSES].badge}`}>
                    {LEAVE_STATUSES[l.status as keyof typeof LEAVE_STATUSES].label}
                  </span>{" "}
                  by {l.reviewedBy?.name ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
