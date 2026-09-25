import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { addHoliday, deleteHoliday, setWeekendDays } from "@/lib/actions/leave";
import { todayIn, weekendSet, ymd } from "@/lib/leave";
import { companyTimezone } from "@/lib/tz";
import DatePicker from "@/components/DatePicker";
import FlashToast from "@/components/FlashToast";
import LeaveTabs from "../LeaveTabs";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const OK: Record<string, string> = { added: "Holiday added.", deleted: "Holiday removed.", weekend: "Weekend days saved." };
const ERR: Record<string, string> = {
  invalid: "Give the holiday a date and a name.",
  exists: "That office already has a holiday on that date.",
};

export default async function HolidaysPage({ searchParams }: { searchParams: { ok?: string; error?: string; year?: string } }) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const isManager = isManagerOrAdmin(user.role);
  const today = todayIn(companyTimezone(user.company));
  const year = /^\d{4}$/.test(searchParams.year ?? "") ? Number(searchParams.year) : Number(today.slice(0, 4));

  const [holidays, companies, pending] = await Promise.all([
    db.holiday.findMany({
      where: { date: { gte: new Date(`${year}-01-01T00:00:00Z`), lte: new Date(`${year}-12-31T00:00:00Z`) } },
      include: { company: { select: { code: true } } },
      orderBy: { date: "asc" },
    }),
    db.company.findMany({ orderBy: { code: "asc" } }),
    isManager ? db.leave.count({ where: { status: "PENDING", userId: { not: user.id } } }) : Promise.resolve(0),
  ]);

  const byMonth = new Map<string, typeof holidays>();
  for (const h of holidays) {
    const m = new Date(h.date).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long" });
    byMonth.set(m, [...(byMonth.get(m) ?? []), h]);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {searchParams.ok && OK[searchParams.ok] && <FlashToast message={OK[searchParams.ok]} />}
      <div>
        <h1 className="text-2xl font-bold">Leave &amp; holidays</h1>
        <p className="text-sm text-slate-500">Office holidays and weekends. They&apos;re skipped when leave days are counted.</p>
      </div>
      <LeaveTabs active="holidays" isManager={isManager} pending={pending} />

      {searchParams.error && ERR[searchParams.error] && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{ERR[searchParams.error]}</div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-3" aria-label="Holidays">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">🎉 Holidays {year}</h2>
            <div className="flex gap-2 text-sm">
              <a href={`/leave/holidays?year=${year - 1}`} className="btn-secondary !px-2.5 !py-1 text-xs">← {year - 1}</a>
              <a href={`/leave/holidays?year=${year + 1}`} className="btn-secondary !px-2.5 !py-1 text-xs">{year + 1} →</a>
            </div>
          </div>
          {holidays.length === 0 ? (
            <p className="text-sm text-slate-400">No holidays for {year} yet.{isAdmin ? " Add them on the right." : ""}</p>
          ) : (
            <div className="space-y-4">
              {Array.from(byMonth.entries()).map(([month, list]) => (
                <div key={month}>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{month}</div>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {list.map((h) => {
                      const past = ymd(h.date) < today;
                      return (
                        <li key={h.id} className={`flex items-center gap-3 py-2 text-sm ${past ? "opacity-50" : ""}`}>
                          <span className="w-24 shrink-0 text-slate-500">
                            {new Date(h.date).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })}
                          </span>
                          <span className="flex-1 font-medium">{h.name}</span>
                          <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{h.company?.code ?? "All offices"}</span>
                          {isAdmin && (
                            <form action={deleteHoliday}>
                              <input type="hidden" name="id" value={h.id} />
                              <button type="submit" className="text-xs text-red-600 hover:underline" title="Remove holiday">
                                Remove
                              </button>
                            </form>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="space-y-5 lg:col-span-2">
          {isAdmin && (
            <form action={addHoliday} className="card space-y-3 p-5" aria-label="Add a holiday">
              <h2 className="font-semibold">Add a holiday</h2>
              <div>
                <label className="label">Date *</label>
                <DatePicker name="date" required />
              </div>
              <div>
                <label className="label">Name *</label>
                <input name="name" required maxLength={100} className="input" placeholder="e.g. Diwali, Eid al-Adha" />
              </div>
              <div>
                <label className="label">Office</label>
                <select name="companyId" className="input" defaultValue="">
                  <option value="">All offices</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-primary w-full">
                Add holiday
              </button>
            </form>
          )}

          <section className="card p-5" aria-label="Weekends">
            <h2 className="font-semibold">Weekend days</h2>
            <p className="mb-3 text-xs text-slate-500">Days each office is normally closed.</p>
            <div className="space-y-3">
              {companies.map((c) => {
                const off = weekendSet(c.weekendDays);
                return isAdmin ? (
                  <form key={c.id} action={setWeekendDays} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="companyId" value={c.id} />
                    <span className="w-10 text-sm font-semibold">{c.code}</span>
                    {WEEKDAYS.map((d, i) => (
                      <label key={d} className="flex cursor-pointer items-center">
                        <input type="checkbox" name="day" value={i} defaultChecked={off.has(i)} className="peer sr-only" />
                        <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-xs text-slate-500 peer-checked:border-slate-700 peer-checked:bg-slate-700 peer-checked:text-white peer-focus-visible:ring-2 dark:border-slate-600">
                          {d}
                        </span>
                      </label>
                    ))}
                    <button type="submit" className="btn-secondary !px-2 !py-0.5 text-xs">
                      Save
                    </button>
                  </form>
                ) : (
                  <div key={c.id} className="flex items-center gap-2 text-sm">
                    <span className="w-10 font-semibold">{c.code}</span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {Array.from(off).map((i) => WEEKDAYS[i]).join(" + ") || "none"}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
