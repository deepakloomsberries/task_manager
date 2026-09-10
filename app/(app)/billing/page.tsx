import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getBillingSetting, updateBillingRate, generateBillingSnapshot } from "@/lib/actions/billing";
import { currentPeriod, periodLabel } from "@/lib/billing";
import { fmtDateTime, fmtMoney } from "@/lib/ui";
import ConfirmButton from "@/components/ConfirmButton";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  saved: { text: "Rate updated." },
  generated: { text: "This month's snapshot has been generated below." },
  invalid: { text: "Please enter a valid rate and currency code.", error: true },
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string; generated?: string };
}) {
  await requireAdmin();

  const [setting, activeUsers, activeUserRows, snapshots] = await Promise.all([
    getBillingSetting(),
    db.user.count({ where: { active: true } }),
    db.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, department: { select: { name: true } } },
    }),
    db.billingSnapshot.findMany({
      orderBy: { period: "desc" },
      include: { generatedBy: { select: { name: true } } },
      take: 24,
    }),
  ]);

  const status = searchParams.saved ? "saved" : searchParams.generated ? "generated" : searchParams.error ? "error" : null;
  const message = status === "error" ? MESSAGES[searchParams.error!] : status ? MESSAGES[status] : null;

  const projectedTotal = activeUsers * setting.ratePerSeat;
  const period = currentPeriod();
  const alreadyGenerated = snapshots.find((s) => s.period === period);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-slate-500">
          Internal per-seat cost, for charging back to finance — {activeUsers} active user
          {activeUsers === 1 ? "" : "s"} right now.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold">This month — {periodLabel(period)}</h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Active users</dt>
              <dd className="font-medium">{activeUsers}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Rate per user</dt>
              <dd className="font-medium">{fmtMoney(setting.ratePerSeat, setting.currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-1.5 text-base dark:border-slate-700">
              <dt className="font-semibold">Projected total</dt>
              <dd className="font-bold text-sky-700 dark:text-sky-400">{fmtMoney(projectedTotal, setting.currency)}</dd>
            </div>
          </dl>
          <form action={generateBillingSnapshot}>
            <ConfirmButton
              tone="primary"
              className="btn-primary w-full !py-2 text-sm"
              message={
                alreadyGenerated
                  ? `A snapshot for ${periodLabel(period)} already exists — regenerate it with today's headcount and rate?`
                  : `Freeze ${activeUsers} users × ${fmtMoney(setting.ratePerSeat, setting.currency)} as the ${periodLabel(period)} invoice?`
              }
              confirmLabel={alreadyGenerated ? "Regenerate" : "Generate"}
            >
              {alreadyGenerated ? "Regenerate this month's snapshot" : "Generate this month's snapshot"}
            </ConfirmButton>
          </form>
          <p className="text-xs text-slate-400">
            Freezes today&rsquo;s headcount and rate as a fixed record for finance, even if either changes later this month.
          </p>
        </div>

        <div className="card space-y-3 p-5">
          <h2 className="font-semibold">Rate</h2>
          <form action={updateBillingRate} className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="label">Per seat, per month</label>
                <input
                  type="number"
                  name="ratePerSeat"
                  min={0}
                  step={1}
                  defaultValue={setting.ratePerSeat}
                  required
                  className="input"
                />
              </div>
              <div className="w-24">
                <label className="label">Currency</label>
                <input
                  type="text"
                  name="currency"
                  maxLength={6}
                  defaultValue={setting.currency}
                  required
                  className="input uppercase"
                />
              </div>
            </div>
            <button type="submit" className="btn-secondary w-full !py-2 text-sm">
              Save rate
            </button>
          </form>
          <p className="text-xs text-slate-400">Last changed {fmtDateTime(setting.updatedAt)}.</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
          <h2 className="font-semibold">Invoice history</h2>
          <PrintButton />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="th">Month</th>
                <th className="th">Users</th>
                <th className="th">Rate</th>
                <th className="th">Total</th>
                <th className="th">Generated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {snapshots.length === 0 && (
                <tr>
                  <td colSpan={5} className="td py-10 text-center text-slate-400">
                    No snapshots generated yet — use the button above once headcount for the month is settled.
                  </td>
                </tr>
              )}
              {snapshots.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="td font-medium">{periodLabel(s.period)}</td>
                  <td className="td text-slate-600">{s.activeUsers}</td>
                  <td className="td text-slate-600">{fmtMoney(s.ratePerSeat, s.currency)}</td>
                  <td className="td font-semibold">{fmtMoney(s.totalAmount, s.currency)}</td>
                  <td className="td text-slate-500">
                    {fmtDateTime(s.generatedAt)} · {s.generatedBy.name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details className="card p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-600 dark:text-slate-300">
          Active users counted this month ({activeUserRows.length})
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[500px] text-sm">
            <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-1.5 pr-4">Name</th>
                <th className="py-1.5 pr-4">Email</th>
                <th className="py-1.5">Department</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeUserRows.map((u) => (
                <tr key={u.id}>
                  <td className="py-1.5 pr-4">{u.name}</td>
                  <td className="py-1.5 pr-4 text-slate-500">{u.email}</td>
                  <td className="py-1.5 text-slate-500">{u.department?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
