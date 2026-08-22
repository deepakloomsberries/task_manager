import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { restoreTask, purgeTask } from "@/lib/actions/tasks";
import { restoreNote, purgeNote } from "@/lib/actions/notes";
import { TASK_STATUSES, TASK_PRIORITIES, lookup, fmtDateTime } from "@/lib/ui";
import ConfirmButton from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

export default async function TrashPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  // Only administrators can see the recycle bin and restore items.
  await requireAdmin();
  const q = (searchParams.q ?? "").trim();
  const idMatch = q.match(/^(?:tm-?|#)?(\d+)$/i);

  const taskSearch = q
    ? {
        OR: [
          { title: { contains: q } },
          ...(idMatch ? [{ id: Number(idMatch[1]) }] : []),
        ],
      }
    : {};
  const noteSearch = q
    ? { OR: [{ title: { contains: q } }, { body: { contains: q } }] }
    : {};

  const [tasks, notes] = await Promise.all([
    db.task.findMany({
      where: {
        deletedAt: { not: null },
        // Recurring occurrences are auto-archived by the nightly roll-over; they
        // belong in the Recurring grid, not the Recycle bin.
        seriesId: null,
        OR: [{ parentId: null }, { parent: { deletedAt: null } }],
        ...taskSearch,
      },
      include: { project: true, assignee: true, createdBy: true, parent: true },
      orderBy: { deletedAt: "desc" },
    }),
    db.note.findMany({
      where: { deletedAt: { not: null }, ...noteSearch },
      include: { user: true },
      orderBy: { deletedAt: "desc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Recycle bin</h1>
        <p className="text-sm text-slate-500">
          Deleted tasks and notes are kept here. Restore a task and its subtasks
          come back too.
        </p>
      </div>

      <form method="GET" className="card flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1">
          <label className="label">Search the recycle bin</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="Task title, TM-ID or note text…"
            className="input"
          />
        </div>
        <button type="submit" className="btn-primary">
          Search
        </button>
        {q && (
          <Link href="/trash" className="btn-secondary">
            Clear
          </Link>
        )}
      </form>

      <div className="card overflow-x-auto">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">
          Tasks ({tasks.length})
        </h2>
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
                <td colSpan={5} className="td py-8 text-center text-slate-400">
                  No deleted tasks.
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
                        <ConfirmButton message="Permanently delete this task? This cannot be undone." className="btn-danger !py-1.5 text-xs">
                          Delete forever
                        </ConfirmButton>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="border-b border-slate-200 px-5 py-3 text-sm font-semibold">
          Notes ({notes.length})
        </h2>
        <table className="w-full min-w-[600px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">Note</th>
              <th className="th">Owner</th>
              <th className="th">Deleted</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {notes.length === 0 && (
              <tr>
                <td colSpan={4} className="td py-8 text-center text-slate-400">
                  No deleted notes.
                </td>
              </tr>
            )}
            {notes.map((n) => (
              <tr key={n.id} className="hover:bg-slate-50">
                <td className="td">
                  <div className="font-medium text-slate-700">{n.title}</div>
                  {n.body && (
                    <div className="truncate text-xs text-slate-400">{n.body.slice(0, 80)}</div>
                  )}
                </td>
                <td className="td text-slate-600">{n.user.name}</td>
                <td className="td text-xs text-slate-500">{fmtDateTime(n.deletedAt)}</td>
                <td className="td">
                  <div className="flex justify-end gap-2">
                    <form action={restoreNote}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="btn-secondary !py-1.5 text-xs">
                        Restore
                      </button>
                    </form>
                    <form action={purgeNote}>
                      <input type="hidden" name="id" value={n.id} />
                      <ConfirmButton message="Permanently delete this note? This cannot be undone." className="btn-danger !py-1.5 text-xs">
                        Delete forever
                      </ConfirmButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
