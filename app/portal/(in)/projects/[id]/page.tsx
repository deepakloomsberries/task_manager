import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireClient } from "@/lib/clientAuth";
import { awaitingClient, fmtDay, stage } from "../../status";

export const dynamic = "force-dynamic";

export default async function PortalProject(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const contact = await requireClient();
  const project = await db.project.findFirst({
    where: { id: Number(params.id) || 0, clientId: contact.clientId },
    include: {
      tasks: {
        where: { clientVisible: true, deletedAt: null },
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          completedAt: true,
          clientStatus: true,
          _count: { select: { attachments: { where: { clientVisible: true, deletedAt: null } }, clientComments: true } },
        },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      },
    },
  });
  if (!project) notFound();
  const done = project.tasks.filter((t) => t.status === "DONE").length;
  const pct = project.tasks.length ? Math.round((done / project.tasks.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <Link href="/portal" className="text-sm text-slate-500 hover:underline">
        ← All projects
      </Link>
      <div className="card p-6">
        <h1 className="text-xl font-bold">{project.name}</h1>
        {project.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{project.description}</p>}
        <div className="mt-5 mb-1 flex justify-between text-xs text-slate-500">
          <span>
            {done} of {project.tasks.length} steps done
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
          <div className="h-full rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
            <tr>
              <th className="th">Step</th>
              <th className="th">Stage</th>
              <th className="th">Due</th>
              <th className="th">Your sign-off</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {project.tasks.length === 0 && (
              <tr>
                <td colSpan={4} className="td py-8 text-center text-slate-400">
                  Nothing shared in this project yet.
                </td>
              </tr>
            )}
            {project.tasks.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="td">
                  <Link href={`/portal/tasks/${t.id}`} className="font-medium text-sky-700 hover:underline dark:text-sky-400">
                    {t.title}
                  </Link>
                  <div className="text-xs text-slate-400">
                    {t._count.attachments > 0 && `📎 ${t._count.attachments} `}
                    {t._count.clientComments > 0 && `💬 ${t._count.clientComments}`}
                  </div>
                </td>
                <td className="td">
                  <span className={`badge ${stage(t.status).badge}`}>{stage(t.status).label}</span>
                </td>
                <td className="td text-sm">{t.status === "DONE" ? `Done ${fmtDay(t.completedAt)}` : fmtDay(t.dueDate)}</td>
                <td className="td text-sm">
                  {t.clientStatus === "APPROVED" ? (
                    <span className="text-green-700 dark:text-green-400">✅ Approved</span>
                  ) : t.clientStatus === "CHANGES" ? (
                    <span className="text-amber-700 dark:text-amber-400">✏️ Changes asked</span>
                  ) : awaitingClient(t) ? (
                    <Link href={`/portal/tasks/${t.id}#signoff`} className="font-medium text-violet-700 hover:underline dark:text-violet-300">
                      Review now →
                    </Link>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
