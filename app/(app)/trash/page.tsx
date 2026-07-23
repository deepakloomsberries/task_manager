import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { restoreTask, purgeTask } from "@/lib/actions/tasks";
import { TASK_STATUSES, TASK_PRIORITIES, lookup, fmtDateTime } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function TrashPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const user = await requireUser();
  const canSeeAll = isManagerOrAdmin(user.role);

  // Show independently-deleted tasks (skip subtasks that were removed together
  // with a deleted parent — restoring the parent brings those back).
  const tasks = await db.task.findMany({
    where: {
      deletedAt: { not: null },
      OR: [{ parentId: null }, { parent: { deletedAt: null } }],
      ...(canSeeAll ? {} : { createdById: user.id }),
    },
    include: { project: true, assignee: true, createdBy: true, parent: true },
    orderBy: { deletedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Recycle bin</h1>
        <p className="text-sm text-slate-500">
          Deleted tasks are kept here so you can restore them. Restoring a task
          also brings back its subtasks.
        </p>
      </div>

      {searchParams.error === "forbidden" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Only the person who assigned a task (or a manager) can restore or remove it.
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Task</th>
              <th className="th">Assignee</th>
              <th className="th">Priority</th>
              <th className="th">Deleted</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.length === 0 && (
              <tr>
                <td colSpan={5} className="td py-10 text-center text-slate-400">
                  The recycle bin is empty.
                </td>
              </tr>
            )}
            {tasks.map((t) => {
              const priority = lookup(TASK_PRIORITIES, t.priority);
              const status = lookup(TASK_STATUSES, t.status);
              return (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-slate-400">TM-{t.id}</span>
                      <span className="font-medium text-slate-700">{t.title}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      {t.parent && <span>↳ under &ldquo;{t.parent.title}&rdquo;</span>}
                      {t.project && <span>{t.project.name}</span>}
                      <span className={`badge ${status.badge}`}>{status.label}</span>
                    </div>
                  </td>
                  <td className="td text-slate-600">{t.assignee?.name ?? "—"}</td>
                  <td className="td">
                    <span className={`badge ${priority.badge}`}>{priority.label}</span>
                  </td>
                  <td className="td text-xs text-slate-500">{fmtDateTime(t.deletedAt)}</td>
                  <td className="td">
                    <div className="flex justify-end gap-2">
                      <form action={restoreTask}>
                        <input type="hidden" name="id" value={t.id} />
                        <button type="submit" className="btn-secondary !py-1.5 text-xs">
                          Restore
                        </button>
                      </form>
                      <form action={purgeTask}>
                        <input type="hidden" name="id" value={t.id} />
                        <button type="submit" className="btn-danger !py-1.5 text-xs">
                          Delete forever
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
