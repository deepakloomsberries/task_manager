import Link from "next/link";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { createTask, moveTask } from "@/lib/actions/tasks";
import Board, { type BoardTask } from "@/components/Board";
import BulkTaskTable, { type ListRow } from "@/components/BulkTaskTable";
import RememberTaskView from "@/components/RememberTaskView";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  lookup,
  fmtDate,
  isOverdue,
  initials,
  avatarColor,
  tagBadge,
} from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: {
    status?: string;
    assignee?: string;
    project?: string;
    tag?: string;
    q?: string;
    new?: string;
    view?: string;
    open?: string;
    overdue?: string;
    due?: string;
    blocked?: string;
    sort?: string;
  };
}) {
  const user = await requireUser();

  const where: Record<string, unknown> = { deletedAt: null };
  if (searchParams.status) where.status = searchParams.status;
  if (searchParams.assignee === "me") where.assigneeId = user.id;
  else if (searchParams.assignee) where.assigneeId = Number(searchParams.assignee);
  if (searchParams.project) where.projectId = Number(searchParams.project);
  // Dashboard deep-links: open (not done), overdue, and due-this-week.
  if (searchParams.open) where.status = { not: "DONE" };
  if (searchParams.overdue) {
    where.status = { not: "DONE" };
    where.dueDate = { lt: new Date() };
  }
  if (searchParams.due === "week") {
    where.status = { not: "DONE" };
    where.dueDate = { gte: new Date(), lt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) };
  }
  // Only tasks with at least one unfinished blocker.
  if (searchParams.blocked) {
    where.blockedBy = { some: { blocker: { status: { not: "DONE" }, deletedAt: null } } };
  }
  if (searchParams.q) {
    const q = searchParams.q.trim();
    // Support searching by task ID, e.g. "TM-42", "#42" or plain "42".
    const idMatch = q.match(/^(?:tm-?|#)?(\d+)$/i);
    if (idMatch) where.id = Number(idMatch[1]);
    else where.title = { contains: q };
  }
  if (searchParams.tag) where.tags = { some: { tag: { name: searchParams.tag } } };

  const orderBy =
    searchParams.sort === "updated"
      ? [{ updatedAt: "desc" as const }]
      : searchParams.sort === "created"
        ? [{ createdAt: "desc" as const }]
        : searchParams.sort === "title"
          ? [{ title: "asc" as const }]
          : [{ status: "asc" as const }, { dueDate: "asc" as const }, { createdAt: "desc" as const }];

  const [tasks, users, projects, allTags] = await Promise.all([
    db.task.findMany({
      where,
      orderBy,
      include: {
        project: true,
        assignee: true,
        parent: true,
        tags: { include: { tag: true } },
        subtasks: { where: { deletedAt: null }, select: { id: true, status: true } },
        blockedBy: { include: { blocker: { select: { status: true } } } },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.project.findMany({
      where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
      orderBy: { name: "asc" },
    }),
    db.tag.findMany({ orderBy: { name: "asc" } }),
  ]);

  const showNew = searchParams.new === "1";
  // Remember the last view (list/board) between visits via a cookie, so
  // switching tabs and coming back doesn't reset the board to the list.
  const cookieView = cookies().get("taskView")?.value;
  const boardView = searchParams.view ? searchParams.view === "board" : cookieView === "board";
  const viewParam = boardView ? "board" : "list";
  const canManage = isManagerOrAdmin(user.role);

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && k !== "view" && k !== "new") query.set(k, v);
  }
  const baseQuery = query.toString();
  const withView = (view: string) => `/tasks?${baseQuery ? `${baseQuery}&` : ""}view=${view}`;
  const listHref = withView("list");
  const boardHref = withView("board");

  const boardTasks: BoardTask[] = tasks.map((t) => {
    const priority = lookup(TASK_PRIORITIES, t.priority);
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      priorityLabel: priority.label,
      priorityBadge: priority.badge,
      assigneeInitials: t.assignee ? initials(t.assignee.name) : null,
      assigneeName: t.assignee?.name ?? null,
      assigneeColor: t.assignee ? avatarColor(t.assignee.name) : null,
      projectName: t.project?.name ?? null,
      dueLabel: t.dueDate ? fmtDate(t.dueDate) : null,
      overdue: isOverdue(t),
      blocked: t.blockedBy.some((d) => d.blocker.status !== "DONE"),
      canMove: t.assigneeId === user.id || canManage,
      tags: t.tags.map(({ tag }) => ({ name: tag.name, badge: tagBadge(tag.color) })),
    };
  });

  const listRows: ListRow[] = tasks.map((t) => {
    const status = lookup(TASK_STATUSES, t.status);
    const priority = lookup(TASK_PRIORITIES, t.priority);
    return {
      id: t.id,
      title: t.title,
      statusValue: t.status,
      statusLabel: status.label,
      statusBadge: status.badge,
      priorityLabel: priority.label,
      priorityBadge: priority.badge,
      projectName: t.project?.name ?? null,
      assigneeName: t.assignee?.name ?? null,
      dueLabel: t.dueDate ? fmtDate(t.dueDate) : null,
      overdue: isOverdue(t),
      blocked: t.blockedBy.some((d) => d.blocker.status !== "DONE"),
      subDone: t.subtasks.filter((s) => s.status === "DONE").length,
      subTotal: t.subtasks.length,
      parentTitle: t.parent?.title ?? null,
      tags: t.tags.map(({ tag }) => ({ name: tag.name, badge: tagBadge(tag.color) })),
    };
  });

  return (
    <div className="space-y-4">
      <RememberTaskView view={viewParam} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm dark:border-slate-600">
            <Link
              href={listHref}
              className={`rounded-md px-3 py-1 ${!boardView ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300"}`}
            >
              List
            </Link>
            <Link
              href={boardHref}
              className={`rounded-md px-3 py-1 ${boardView ? "bg-sky-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300"}`}
            >
              Board
            </Link>
          </div>
          <Link href={showNew ? listHref : "/tasks?new=1"} className="btn-primary">
            {showNew ? "Close" : "+ New Task"}
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-400">Quick view:</span>
        <Link
          href={`/tasks?view=${viewParam}`}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            !searchParams.assignee
              ? "bg-sky-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          All tasks
        </Link>
        <Link
          href={`/tasks?assignee=me&view=${viewParam}`}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            searchParams.assignee === "me"
              ? "bg-sky-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Assigned to me
        </Link>
        <Link
          href={`/tasks?blocked=1&view=${viewParam}`}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            searchParams.blocked
              ? "bg-red-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          ⛔ Blocked
        </Link>
      </div>

      {showNew && (
        <div className="card p-5">
          <h2 className="mb-4 font-semibold">Create task</h2>
          <form action={createTask} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">Title *</label>
              <input name="title" required className="input" placeholder="What needs to be done?" />
            </div>
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <textarea name="description" rows={3} className="input" />
            </div>
            <div>
              <label className="label">Project</label>
              <select name="projectId" className="input">
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
              <select name="assigneeId" className="input" defaultValue={user.id}>
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
              <select name="priority" className="input" defaultValue="MEDIUM">
                {TASK_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Due date</label>
              <input name="dueDate" type="date" className="input" />
            </div>
            <div className="md:col-span-2">
              <button type="submit" className="btn-primary">
                Create task
              </button>
            </div>
          </form>
        </div>
      )}

      <form className="card flex flex-wrap items-end gap-3 p-4" method="GET">
        <input type="hidden" name="view" value={viewParam} />
        <div className="w-44">
          <label className="label">Search</label>
          <input name="q" defaultValue={searchParams.q ?? ""} className="input" placeholder="Title or TM-ID…" />
        </div>
        <div>
          <label className="label">Status</label>
          <select name="status" defaultValue={searchParams.status ?? ""} className="input">
            <option value="">All</option>
            {TASK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Assignee</label>
          <select name="assignee" defaultValue={searchParams.assignee ?? ""} className="input">
            <option value="">Everyone</option>
            <option value="me">My tasks</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Project</label>
          <select name="project" defaultValue={searchParams.project ?? ""} className="input">
            <option value="">All</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {allTags.length > 0 && (
          <div>
            <label className="label">Tag</label>
            <select name="tag" defaultValue={searchParams.tag ?? ""} className="input">
              <option value="">All</option>
              {allTags.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label">Sort</label>
          <select name="sort" defaultValue={searchParams.sort ?? ""} className="input">
            <option value="">Default (status · due)</option>
            <option value="updated">Recently updated</option>
            <option value="created">Recently created</option>
            <option value="title">Title (A–Z)</option>
          </select>
        </div>
        <button type="submit" className="btn-primary">
          Apply filters
        </button>
        <Link
          href={`/tasks?view=${viewParam}`}
          className="btn-secondary gap-1.5"
          title="Reset all filters"
        >
          <span aria-hidden>✕</span> Clear
        </Link>
      </form>

      {boardView ? (
        <Board columns={TASK_STATUSES} tasks={boardTasks} moveAction={moveTask} />
      ) : (
        <BulkTaskTable rows={listRows} users={users} projects={projects} back={listHref} />
      )}
    </div>
  );
}
