import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { cancelLeave, requestLeave } from "@/lib/actions/leave";
import { LEAVE_STATUSES, LEAVE_TYPES, fmtDays, fmtRange, leaveType, todayIn, ymd } from "@/lib/leave";
import { holidaysFor } from "@/lib/leaveData";
import { companyTimezone } from "@/lib/tz";
import DatePicker from "@/components/DatePicker";
import FlashToast from "@/components/FlashToast";
import LeaveTabs from "./LeaveTabs";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  dates: "Pick a start date, and an end date on or after it.",
  type: "Choose a leave type.",
  "too-long": "A single request can be at most 60 days — split longer leave into two requests.",
  "half-day": "A half day must start and end on the same day.",
  overlap: "You already have leave booked (or pending) on some of those days.",
  "no-working-days": "Those days are all weekends or holidays — no leave needed.",
  "cannot-cancel": "Leave that has already started can't be cancelled. Ask your manager.",
};
const OK: Record<string, string> = {
  requested: "Leave requested — your manager has been notified.",
  approved: "Leave booked.",
  cancelled: "Leave cancelled.",
};

export default async function MyLeavePage(props: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  const isManager = isManagerOrAdmin(user.role);
  const today = todayIn(companyTimezone(user.company));
  const year = today.slice(0, 4);

  const [mine, holidays, pending] = await Promise.all([
    db.leave.findMany({
      where: { userId: user.id },
      include: { reviewedBy: { select: { name: true } } },
      orderBy: { startDate: "desc" },
      take: 100,
    }),
    holidaysFor(user.companyId, today, `${Number(year) + 1}-12-31`),
    isManager ? db.leave.count({ where: { status: "PENDING", userId: { not: user.id } } }) : Promise.resolve(0),
  ]);

  // Approved days this calendar year, by type.
  const used = new Map<string, number>();
  for (const l of mine) {
    if (l.status === "APPROVED" && ymd(l.startDate).startsWith(year)) used.set(l.type, (used.get(l.type) ?? 0) + l.days);
  }
  const totalUsed = Array.from(used.values()).reduce((a, b) => a + b, 0);
  const pendingMine = mine.filter((l) => l.status === "PENDING").length;
  const upcoming = mine.filter((l) => l.status === "APPROVED" && ymd(l.endDate) >= today);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {searchParams.ok && OK[searchParams.ok] && <FlashToast message={OK[searchParams.ok]} />}
      <div>
        <h1 className="text-2xl font-bold">Leave &amp; holidays</h1>
        <p className="text-sm text-slate-500">Request time off, see your balance used and upcoming office holidays.</p>
      </div>
      <LeaveTabs active="mine" isManager={isManager} pending={pending} />

      {searchParams.error && ERRORS[searchParams.error] && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {ERRORS[searchParams.error]}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-4">
          <div className="text-2xl font-bold">{totalUsed}</div>
          <div className="text-xs text-slate-500">days of leave in {year}</div>
        </div>
        {LEAVE_TYPES.slice(0, 2).map((t) => (
          <div key={t.value} className="card p-4">
            <div className="text-2xl font-bold">{used.get(t.value) ?? 0}</div>
            <div className="text-xs text-slate-500">
              {t.emoji} {t.label.toLowerCase()}
            </div>
          </div>
        ))}
        <div className="card p-4">
          <div className={`text-2xl font-bold ${pendingMine ? "text-amber-600" : ""}`}>{pendingMine}</div>
          <div className="text-xs text-slate-500">waiting for approval</div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <form action={requestLeave} className="card space-y-4 p-5 lg:col-span-2" aria-label="Request leave">
          <h2 className="font-semibold">Request leave</h2>
          <div>
            <label className="label">Type</label>
            <select name="type" className="input" defaultValue="ANNUAL">
              {LEAVE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.emoji} {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">From *</label>
              <DatePicker name="start" required defaultValue={today} />
            </div>
            <div>
              <label className="label">To</label>
              <DatePicker name="end" placeholder="Same day" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" name="halfDay" className="h-4 w-4" />
            Half day (single day only)
          </label>
          <div>
            <label className="label">Reason</label>
            <textarea name="reason" rows={2} className="input" placeholder="Optional — e.g. family wedding" />
          </div>
          <button type="submit" className="btn-primary w-full">
            {user.role === "ADMIN" ? "Book leave" : "Send request"}
          </button>
          <p className="text-xs text-slate-400">
            Weekends and office holidays inside the dates aren&apos;t counted.
            {user.role !== "ADMIN" && " A manager approves it; you'll get a notification."}
          </p>
        </form>

        <div className="space-y-5 lg:col-span-3">
          {upcoming.length > 0 && (
            <div className="card border-emerald-200 p-5 dark:border-emerald-900">
              <h2 className="mb-3 font-semibold">🌴 Coming up</h2>
              <ul className="space-y-2 text-sm">
                {upcoming.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3">
                    <span>
                      {leaveType(l.type).emoji} <b>{fmtRange(l.startDate, l.endDate)}</b> · {fmtDays(l.days)}
                    </span>
                    <span className="text-xs text-slate-400">{leaveType(l.type).label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card overflow-x-auto">
            <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
              <h2 className="font-semibold">My requests</h2>
            </div>
            <table className="w-full min-w-[560px]">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                <tr>
                  <th className="th">Dates</th>
                  <th className="th">Type</th>
                  <th className="th">Days</th>
                  <th className="th">Status</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {mine.length === 0 && (
                  <tr>
                    <td colSpan={5} className="td py-8 text-center text-slate-400">
                      No leave yet.
                    </td>
                  </tr>
                )}
                {mine.map((l) => {
                  const st = LEAVE_STATUSES[l.status as keyof typeof LEAVE_STATUSES] ?? LEAVE_STATUSES.PENDING;
                  const canCancel = l.status === "PENDING" || (l.status === "APPROVED" && ymd(l.startDate) > today);
                  return (
                    <tr key={l.id}>
                      <td className="td">
                        <div className="font-medium">{fmtRange(l.startDate, l.endDate)}</div>
                        {l.reason && <div className="text-xs text-slate-400">{l.reason}</div>}
                      </td>
                      <td className="td">
                        <span className={`badge ${leaveType(l.type).badge}`}>
                          {leaveType(l.type).emoji} {leaveType(l.type).label}
                        </span>
                      </td>
                      <td className="td">{l.halfDay ? "½" : l.days}</td>
                      <td className="td">
                        <span className={`badge ${st.badge}`}>{st.label}</span>
                        {l.reviewedBy && l.status !== "PENDING" && (
                          <div className="mt-0.5 text-[11px] text-slate-400">
                            by {l.reviewedBy.name}
                            {l.reviewNote ? ` — “${l.reviewNote}”` : ""}
                          </div>
                        )}
                      </td>
                      <td className="td text-right">
                        {canCancel && (
                          <form action={cancelLeave}>
                            <input type="hidden" name="id" value={l.id} />
                            <button type="submit" className="text-xs text-red-600 hover:underline">
                              {l.status === "PENDING" ? "Withdraw" : "Cancel"}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-semibold">🎉 Upcoming holidays · {user.company.code}</h2>
              <a href="/leave/holidays" className="text-xs text-sky-700 hover:underline dark:text-sky-400">
                All holidays
              </a>
            </div>
            {holidays.length === 0 ? (
              <p className="text-sm text-slate-400">No holidays added yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-700">
                {holidays.slice(0, 6).map((h) => (
                  <li key={h.id} className="flex justify-between py-2">
                    <span className="font-medium">{h.name}</span>
                    <span className="text-slate-500">
                      {new Date(h.date).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
