import Link from "next/link";
import { cookies } from "next/headers";
import { loadOnboarding, ONBOARDING_COOKIE, ONBOARDING_DAYS } from "@/lib/onboarding";
import DismissOnboarding from "@/components/DismissOnboarding";

/**
 * "Getting started" checklist on the dashboard for accounts younger than
 * ONBOARDING_DAYS. Every step is ticked off from real data (photo set, timer
 * used, timesheet submitted…), links to where to do it and to the guide
 * article that shows how. Hidden once everything's done or it's dismissed.
 */
export default async function GettingStarted({
  user,
}: {
  user: { id: number; name: string; role: string; createdAt: Date; avatarPath: string | null; preferredLanguage: string | null };
}) {
  if (cookies().get(ONBOARDING_COOKIE)?.value === "1") return null;
  if (Date.now() - new Date(user.createdAt).getTime() > ONBOARDING_DAYS * 86400000) return null;

  const steps = await loadOnboarding(user);
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const pct = Math.round((done / steps.length) * 100);

  return (
    <section className="card overflow-hidden" aria-label="Getting started">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-white px-5 py-4 dark:border-slate-700 dark:from-sky-950/40 dark:to-slate-800">
        <div>
          <h2 className="font-semibold">👋 Getting started, {user.name.split(" ")[0]}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {done} of {steps.length} done — each step takes a minute.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/use#getting-started" target="_blank" rel="noopener" className="btn-secondary !py-1.5 text-xs">
            📘 5-minute guide
          </a>
          <DismissOnboarding />
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-700">
        <div className="h-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      {/* Cells draw their own right/bottom rules; the -m-px hides the outer ones. */}
      <ol className="-mb-px -mr-px grid sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-3 border-b border-r border-slate-100 p-4 dark:border-slate-700">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                s.done ? "bg-green-500 text-white" : "border-2 border-slate-300 text-transparent dark:border-slate-500"
              }`}
              aria-label={s.done ? "Done" : "Not done yet"}
            >
              ✓
            </span>
            <div className="min-w-0">
              {s.done ? (
                <div className="text-sm font-medium text-slate-400 line-through">{s.label}</div>
              ) : (
                <Link href={s.href} className="text-sm font-medium hover:text-sky-700 dark:hover:text-sky-300">
                  {s.label} →
                </Link>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {s.hint}{" "}
                {!s.done && (
                  <a href={`/use#${s.guide}`} target="_blank" rel="noopener" className="text-sky-700 hover:underline dark:text-sky-400">
                    Show me how
                  </a>
                )}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
