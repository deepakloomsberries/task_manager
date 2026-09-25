import Link from "next/link";
import { db } from "@/lib/db";
import { requireClient } from "@/lib/clientAuth";
import FlashToast from "@/components/FlashToast";
import { awaitingClient, fmtDay, stage } from "./status";

export const dynamic = "force-dynamic";

export default async function PortalHome({ searchParams }: { searchParams: { ok?: string } }) {
  const contact = await requireClient();
  const projects = await db.project.findMany({
    where: { clientId: contact.clientId },
    orderBy: { createdAt: "desc" },
    include: {
      tasks: {
        where: { clientVisible: true, deletedAt: null },
        select: { id: true, title: true, status: true, dueDate: true, clientStatus: true },
        orderBy: { dueDate: "asc" },
      },
    },
  });
  const waiting = projects.flatMap((p) => p.tasks.filter(awaitingClient).map((t) => ({ ...t, project: p.name })));

  return (
    <div className="space-y-6">
      {searchParams.ok === "password" && <FlashToast message="Password saved." />}
      <div>
        <h1 className="text-2xl font-bold">Hello {contact.name.split(" ")[0]} 👋</h1>
        <p className="text-sm text-slate-500">Here&apos;s where your projects with Looms &amp; Berries stand.</p>
      </div>

      {waiting.length > 0 && (
        <section className="card border-amber-200 p-5 dark:border-amber-900" aria-label="Waiting for your approval">
          <h2 className="mb-3 font-semibold">✋ Waiting for your approval ({waiting.length})</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {waiting.map((t) => (
              <li key={t.id}>
                <Link href={`/portal/tasks/${t.id}`} className="flex items-center gap-3 py-2 text-sm hover:underline">
                  <span className="flex-1 font-medium">{t.title}</span>
                  <span className="text-xs text-slate-500">{t.project}</span>
                  {t.clientStatus === "CHANGES" && <span className="badge bg-amber-100 text-amber-800">Changes asked</span>}
                  <span className="text-sky-700 dark:text-sky-400">Review →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {projects.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          No projects are shared with you yet. Your account manager will add them.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => {
            const done = p.tasks.filter((t) => t.status === "DONE").length;
            const pct = p.tasks.length ? Math.round((done / p.tasks.length) * 100) : 0;
            const next = p.tasks.find((t) => t.status !== "DONE" && t.dueDate);
            return (
              <Link key={p.id} href={`/portal/projects/${p.id}`} className="card block p-5 transition hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">{p.name}</h2>
                  <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {p.status === "COMPLETED" ? "Completed" : p.status === "ON_HOLD" ? "On hold" : "Active"}
                  </span>
                </div>
                <div className="mt-4 mb-1 flex justify-between text-xs text-slate-500">
                  <span>
                    {done} of {p.tasks.length} steps done
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {next ? (
                    <>
                      Next: <b>{next.title}</b> · <span className={`badge ${stage(next.status).badge}`}>{stage(next.status).label}</span> · due{" "}
                      {fmtDay(next.dueDate)}
                    </>
                  ) : p.tasks.length ? (
                    "Everything shared is done ✅"
                  ) : (
                    "Nothing shared yet."
                  )}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
