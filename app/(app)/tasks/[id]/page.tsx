import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import {
  updateTask,
  setTaskStatus,
  deleteTask,
  addComment,
  addSubtask,
  sendTaskReminder,
} from "@/lib/actions/tasks";
import { deleteAttachment } from "@/lib/actions/files";
import PasteAttachment from "@/components/PasteAttachment";
import ShareTask from "@/components/ShareTask";
import UserAvatar from "@/components/UserAvatar";
import { addTagToTask, removeTagFromTask } from "@/lib/actions/tags";
import { fmtSize } from "@/lib/storage";
import { TAG_COLORS, tagBadge } from "@/lib/ui";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  lookup,
  fmtDate,
  fmtDateTime,
  toInputDate,
} from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { edit?: string; ok?: string; error?: string };
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
        parent: true,
        subtasks: {
          where: { deletedAt: null },
          include: { assignee: true },
          orderBy: { createdAt: "asc" },
        },
        tags: { include: { tag: true } },
        activities: { include: { actor: true }, orderBy: { createdAt: "desc" }, take: 30 },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.project.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!task || task.deletedAt) notFound();

  const status = lookup(TASK_STATUSES, task.status);
  const priority = lookup(TASK_PRIORITIES, task.priority);
  // Editing details, deleting and sending reminders belong to the person who
  // assigned the task (its creator), plus managers and admins. The assignee can
  // still move the task through its statuses.
  const canEdit = isManagerOrAdmin(user.role) || task.createdById === user.id;
  const canProgress = canEdit || task.assigneeId === user.id;
  const canDelete = canEdit;
  const editing = searchParams.edit === "1" && canEdit;
  const taskCode = `TM-${task.id}`;

  const banner =
    searchParams.ok === "reminder"
      ? { text: `Reminder sent to ${task.assignee?.name ?? "the assignee"}.`, error: false }
      : searchParams.error === "subtask-assignee"
        ? { text: "A subtask must be assigned to someone before it can be saved.", error: true }
        : searchParams.error === "no-assignee"
          ? { text: "Assign this task to someone before sending a reminder.", error: true }
          : searchParams.error === "forbidden"
            ? { text: "Only the person who assigned this task can do that.", error: true }
            : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link
        href={task.parent ? `/tasks/${task.parent.id}` : "/tasks"}
        className="text-sm text-slate-500 hover:underline"
      >
        ← {task.parent ? `Back to "${task.parent.title}"` : "Back to tasks"}
      </Link>

      {banner && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            banner.error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {banner.text}
        </div>
      )}

      <div className="card p-6">
        {!editing ? (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-1 font-mono text-xs font-medium text-slate-400">{taskCode}</div>
                <h1 className="text-xl font-bold">{task.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`badge ${status.badge}`}>{status.label}</span>
                  <span className={`badge ${priority.badge}`}>{priority.label}</span>
                  {task.tags.map(({ tag }) => (
                    <span key={tag.id} className={`badge ${tagBadge(tag.color)}`}>
                      {tag.name}
                      {canEdit && (
                        <form action={removeTagFromTask} className="ml-1 inline">
                          <input type="hidden" name="taskId" value={task.id} />
                          <input type="hidden" name="tagId" value={tag.id} />
                          <button type="submit" title="Remove tag" className="opacity-50 hover:opacity-100">
                            ✕
                          </button>
                        </form>
                      )}
                    </span>
                  ))}
                  {canEdit && (
                    <details className="relative">
                      <summary className="badge cursor-pointer list-none bg-slate-100 text-slate-500 hover:bg-slate-200">
                        + tag
                      </summary>
                      <form
                        action={addTagToTask}
                        className="absolute left-0 top-7 z-10 flex w-64 gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
                      >
                        <input type="hidden" name="taskId" value={task.id} />
                        <input name="name" required maxLength={30} placeholder="Tag name" className="input !py-1.5" />
                        <select name="color" className="input w-24 !py-1.5">
                          {TAG_COLORS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn-primary !px-2.5 !py-1.5 text-xs">
                          Add
                        </button>
                      </form>
                    </details>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <ShareTask code={taskCode} title={task.title} taskId={task.id} />
                {task.createdById === user.id && task.assignee && (
                  <form action={sendTaskReminder}>
                    <input type="hidden" name="id" value={task.id} />
                    <button
                      type="submit"
                      className="btn-secondary"
                      title={`Email a reminder to ${task.assignee.name}`}
                    >
                      Send reminder
                    </button>
                  </form>
                )}
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

            {canProgress && (
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

      {!task.parentId && (
        <div className="card p-6">
          <h2 className="mb-4 font-semibold">
            Subtasks{" "}
            <span className="text-sm font-normal text-slate-400">
              ({task.subtasks.filter((s) => s.status === "DONE").length}/{task.subtasks.length})
            </span>
          </h2>
          {task.subtasks.length > 0 && (
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-green-500"
                style={{
                  width: `${Math.round(
                    (task.subtasks.filter((s) => s.status === "DONE").length /
                      task.subtasks.length) *
                      100
                  )}%`,
                }}
              />
            </div>
          )}
          <div className="divide-y divide-slate-100">
            {task.subtasks.map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-2.5">
                <form action={setTaskStatus}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="status" value={s.status === "DONE" ? "TODO" : "DONE"} />
                  <input type="hidden" name="back" value={`/tasks/${task.id}`} />
                  <button
                    type="submit"
                    title={s.status === "DONE" ? "Mark as not done" : "Mark as done"}
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-xs transition-colors ${
                      s.status === "DONE"
                        ? "border-green-500 bg-green-500 text-white"
                        : "border-slate-300 text-transparent hover:border-green-500"
                    }`}
                  >
                    ✓
                  </button>
                </form>
                <Link
                  href={`/tasks/${s.id}`}
                  className={`flex-1 text-sm hover:text-sky-700 ${
                    s.status === "DONE" ? "text-slate-400 line-through" : "font-medium"
                  }`}
                >
                  {s.title}
                </Link>
                {s.assignee && <UserAvatar user={s.assignee} size={24} />}
              </div>
            ))}
            {task.subtasks.length === 0 && (
              <p className="py-1 text-sm text-slate-400">Break this task into smaller steps.</p>
            )}
          </div>
          {canProgress ? (
            <form
              key={task.subtasks.length}
              action={addSubtask}
              className="mt-3 flex flex-col gap-2 sm:flex-row"
            >
              <input type="hidden" name="parentId" value={task.id} />
              <input name="title" required placeholder="Add a subtask…" className="input flex-1" />
              <select name="assigneeId" required defaultValue="" className="input sm:w-44">
                <option value="" disabled>
                  Assign to…
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-primary">
                Add subtask
              </button>
            </form>
          ) : (
            <p className="mt-3 text-xs text-slate-400">
              Only the assignee or the task owner can add subtasks.
            </p>
          )}
        </div>
      )}

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
              <span className="text-lg text-slate-400">⎘</span>
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
        <PasteAttachment taskId={task.id} />
      </div>

      <div className="card p-6">
        <h2 className="mb-4 font-semibold">
          Discussion <span className="text-sm font-normal text-slate-400">({task.comments.length})</span>
        </h2>
        <div className="space-y-4">
          {task.comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <UserAvatar user={c.author} size={32} />
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
        <div className="mt-3 border-t border-slate-100 pt-3">
          <PasteAttachment taskId={task.id} listenPaste={false} compact />
        </div>
      </div>

      {task.activities.length > 0 && (
        <details className="card p-6">
          <summary className="cursor-pointer font-semibold">
            Activity{" "}
            <span className="text-sm font-normal text-slate-400">({task.activities.length})</span>
          </summary>
          <div className="mt-4 space-y-2 border-l-2 border-slate-100 pl-4">
            {task.activities.map((a) => (
              <div key={a.id} className="text-sm">
                <span className="font-medium">{a.actor.name}</span>{" "}
                <span className="text-slate-600">
                  {a.type === "created" ? "created this task" : a.detail}
                </span>
                <span className="ml-2 text-xs text-slate-400">{fmtDateTime(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
