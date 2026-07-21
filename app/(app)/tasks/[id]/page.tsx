import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { updateTask, setTaskStatus, deleteTask, addComment } from "@/lib/actions/tasks";
import { uploadAttachment, deleteAttachment } from "@/lib/actions/files";
import { fmtSize } from "@/lib/storage";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  lookup,
  fmtDate,
  fmtDateTime,
  toInputDate,
  initials,
} from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { edit?: string };
}) {
  const user = await requireUser();
  const id = Number(params.id);
  if (!id) notFound();

  const [task, users, projects] = await Promise.all([
    db.task.findUnique({
      where: { id },
      include: {
        project: true,
        assignee: true,
        createdBy: true,
        comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
        attachments: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.project.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!task) notFound();

  const status = lookup(TASK_STATUSES, task.status);
  const priority = lookup(TASK_PRIORITIES, task.priority);
  const canEdit =
    isManagerOrAdmin(user.role) || task.createdById === user.id || task.assigneeId === user.id;
  const canDelete = isManagerOrAdmin(user.role) || task.createdById === user.id;
  const editing = searchParams.edit === "1" && canEdit;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/tasks" className="text-sm text-slate-500 hover:underline">
        ← Back to tasks
      </Link>

      <div className="card p-6">
        {!editing ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold">{task.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`badge ${status.badge}`}>{status.label}</span>
                  <span className={`badge ${priority.badge}`}>{priority.label}</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {canEdit && (
                  <Link href={`/tasks/${task.id}?edit=1`} className="btn-secondary">
                    Edit
                  </Link>
                )}
                {canDelete && (
                  <form action={deleteTask}>
                    <input type="hidden" name="id" value={task.id} />
                    <button type="submit" className="btn-danger">
                      Delete
                    </button>
                  </form>
                )}
              </div>
            </div>

            {task.description && (
              <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{task.description}</p>
            )}

            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm md:grid-cols-4">
              <div>
                <dt className="text-xs text-slate-500">Project</dt>
                <dd className="mt-0.5 font-medium">
                  {task.project ? (
                    <Link href={`/projects/${task.project.id}`} className="text-sky-700 hover:underline">
                      {task.project.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Assignee</dt>
                <dd className="mt-0.5 font-medium">{task.assignee?.name ?? "Unassigned"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Due date</dt>
                <dd className="mt-0.5 font-medium">
                  {fmtDate(task.dueDate)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Created by</dt>
                <dd className="mt-0.5 font-medium">{task.createdBy.name}</dd>
              </div>
            </dl>

            {canEdit && (
              <div className="mt-6 border-t border-slate-100 pt-4">
                <div className="mb-2 text-xs font-medium text-slate-500">Move to</div>
                <div className="flex flex-wrap gap-2">
                  {TASK_STATUSES.filter((s) => s.value !== task.status).map((s) => (
                    <form key={s.value} action={setTaskStatus}>
                      <input type="hidden" name="id" value={task.id} />
                      <input type="hidden" name="status" value={s.value} />
                      <button type="submit" className="btn-secondary !py-1.5 text-xs">
                        {s.label}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <form action={updateTask} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="id" value={task.id} />
            <div className="md:col-span-2">
              <label className="label">Title *</label>
              <input name="title" required defaultValue={task.title} className="input" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <textarea
                name="description"
                rows={4}
                defaultValue={task.description ?? ""}
                className="input"
              />
            </div>
            <div>
              <label className="label">Project</label>
              <select name="projectId" defaultValue={task.projectId ?? ""} className="input">
                <option value="">— None —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Assignee</label>
              <select name="assigneeId" defaultValue={task.assigneeId ?? ""} className="input">
                <option value="">— Unassigned —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select name="priority" defaultValue={task.priority} className="input">
                {TASK_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Due date</label>
              <input name="dueDate" type="date" defaultValue={toInputDate(task.dueDate)} className="input" />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <button type="submit" className="btn-primary">
                Save changes
              </button>
              <Link href={`/tasks/${task.id}`} className="btn-secondary">
                Cancel
              </Link>
            </div>
          </form>
        )}
      </div>

      <div className="card p-6">
        <h2 className="mb-4 font-semibold">
          Attachments{" "}
          <span className="text-sm font-normal text-slate-400">({task.attachments.length})</span>
        </h2>
        <div className="space-y-2">
          {task.attachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-2.5"
            >
              <span className="text-lg">📎</span>
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/files/${a.id}`}
                  target="_blank"
                  className="block truncate text-sm font-medium text-sky-700 hover:underline"
                >
                  {a.originalName}
                </a>
                <div className="text-xs text-slate-400">
                  {fmtSize(a.size)} · {a.uploadedBy.name} · {fmtDateTime(a.createdAt)}
                </div>
              </div>
              <a
                href={`/api/files/${a.id}?download=1`}
                className="text-xs text-sky-600 hover:underline"
              >
                Download
              </a>
              {(a.uploadedById === user.id || user.role === "ADMIN") && (
                <form action={deleteAttachment}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className="text-xs text-red-600 hover:underline">
                    Delete
                  </button>
                </form>
              )}
            </div>
          ))}
          {task.attachments.length === 0 && (
            <p className="text-sm text-slate-400">No files attached to this task.</p>
          )}
        </div>
        <form action={uploadAttachment} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="taskId" value={task.id} />
          <input type="file" name="file" required className="input max-w-md" />
          <button type="submit" className="btn-secondary">
            Attach file
          </button>
          <span className="text-xs text-slate-400">Max 20 MB.</span>
        </form>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 font-semibold">
          Discussion <span className="text-sm font-normal text-slate-400">({task.comments.length})</span>
        </h2>
        <div className="space-y-4">
          {task.comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                {initials(c.author.name)}
              </div>
              <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-4 py-3">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{c.author.name}</span>
                  <span className="text-xs text-slate-400">{fmtDateTime(c.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
              </div>
            </div>
          ))}
          {task.comments.length === 0 && (
            <p className="text-sm text-slate-400">No comments yet. Start the discussion below.</p>
          )}
        </div>
        <form action={addComment} key={task.comments.length} className="mt-5 flex gap-3">
          <input type="hidden" name="taskId" value={task.id} />
          <textarea
            name="body"
            rows={2}
            required
            placeholder="Write a comment…"
            className="input flex-1"
          />
          <button type="submit" className="btn-primary self-end">
            Comment
          </button>
        </form>
      </div>
    </div>
  );
}
