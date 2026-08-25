import Link from "next/link";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { createTask, moveTask, setRecurringVisibility } from "@/lib/actions/tasks";
import Board, { type BoardTask } from "@/components/Board";
import BulkTaskTable, { type ListRow } from "@/components/BulkTaskTable";
import DatePicker from "@/components/DatePicker";
import SearchSelect from "@/components/SearchSelect";
import MultiSelect from "@/components/MultiSelect";
import RememberTaskView from "@/components/RememberTaskView";
import SaveViewButton from "@/components/SaveViewButton";
import BulkTaskImport from "@/components/BulkTaskImport";
import AutoRefresh from "@/components/AutoRefresh";
import { deleteSavedView } from "@/lib/actions/savedViews";
import { buildTaskListQuery, TASK_FILTER_KEYS } from "@/lib/taskFilters";
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
    import?: string;
    view?: string;
    open?: string;
    overdue?: string;
    due?: string;
    blocked?: string;
    watching?: string;
    collaborating?: string;
    sort?: string;
  };
}) {
  const user = await requireUser();
  const canManage = isManagerOrAdmin(user.role);

  // Managers/admins don't see the daily recurring occurrences in this list by
  // default (they'd flood it) — a toggle, remembered in a cookie, shows them.
  const showRecurring = cookies().get("showRecurring")?.value === "1";
  const hideRecurring = canManage && !showRecurring;

  const { where, orderBy } = buildTaskListQuery(
    { ...searchParams, hiderec: hideRecurring ? "1" : undefined },
    user.id
  );

  const [tasks, users, projects, allTags, savedViews] = await Promise.all([
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
    db.savedView.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
  ]);

  const showNew = searchParams.new === "1";
  const showImport = searchParams.import === "1";
  // Remember the last view (list/board) between visits via a cookie, so
  // switching tabs and coming back doesn't reset the board to the list.
  const cookieView = cookies().get("taskView")?.value;
  const boardView = searchParams.view ? searchParams.view === "board" : cookieView === "board";
  const viewParam = boardView ? "board" : "list";

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && k !== "view" && k !== "new" && k !== "import") query.set(k, v);
  }
  const baseQuery = query.toString();
  const withView = (view: string) => `/tasks?${baseQuery ? `${baseQuery}&` : ""}view=${view}`;
  const listHref = withView("list");
  const boardHref = withView("board");

  // Export the currently-applied filter view (managers/admins only).
  const filterQuery = new URLSearchParams();
  for (const k of TASK_FILTER_KEYS) {
    const v = (searchParams as Record<string, string | undefined>)[k];
    if (v) filterQuery.set(k, v);
  }
  if (hideRecurring) filterQuery.set("hiderec", "1");
  const exportHref = `/api/export/tasks${filterQuery.toString() ? `?${filterQuery}` : ""}`;

  // Saved views (personal quick views): the current filters as a string, the URL
  // to return to, and whether the current filters are already saved.
  const currentFilterStr = filterQuery.toString();
  const currentHref = withView(viewParam);
  const savedViewHref = (q: string) => `/tasks?${q ? `${q}&` : ""}view=${viewParam}`;
  const alreadySaved = savedViews.some((v) => v.query === currentFilterStr);

  const boardTasks: BoardTask[] = tasks.map((t) => {
    const priority = lookup(TASK_PRIORITIES, t.priority);
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      priorityLabel: priority.label,
      priorityBadge: priority.badge,
      assigneeId: t.assigneeId,
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
      <AutoRefresh />
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
          {canManage && (
            <form action={setRecurringVisibility}>
              <input type="hidden" name="show" value={showRecurring ? "0" : "1"} />
              <input type="hidden" name="back" value={currentHref} />
              <button
                type="submit"
                className="btn-secondary"
                title={showRecurring ? "Hide the daily recurring tasks from this list" : "Show the daily recurring tasks in this list"}
              >
                {showRecurring ? "↻ Hide recurring" : "↻ Show recurring"}
              </button>
            </form>
          )}
          {canManage && (
            <Link href={showImport ? listHref : "/tasks?import=1"} className="btn-secondary">
              {showImport ? "Close" : "⇧ Import"}
            </Link>
          )}
          <Link href={showNew ? listHref : "/tasks?new=1"} className="btn-primary">
            {showNew ? "Close" : "+ New Task"}
          </Link>
        </div>
      </div>

      {showImport && canManage && <BulkTaskImport />}

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
          href={`/tasks?collaborating=1&view=${viewParam}`}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            searchParams.collaborating
              ? "bg-sky-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          🤝 Collaborating
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
        <Link
          href={`/tasks?watching=1&view=${viewParam}`}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            searchParams.watching
              ? "bg-sky-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          👁 Watching
        </Link>

        {/* Saved views — personal quick filters */}
        {savedViews.map((v) => {
          const active = v.query === currentFilterStr;
          return (
            <span
              key={v.id}
              className={`group inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-xs font-medium ${
                active ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
              }`}
            >
              <Link href={savedViewHref(v.query)} title={`Apply "${v.name}"`}>
                ★ {v.name}
              </Link>
              <form action={deleteSavedView} className="flex">
                <input type="hidden" name="id" value={v.id} />
                <input type="hidden" name="back" value={currentHref} />
                <button
                  type="submit"
                  title="Delete this saved view"
                  className={`rounded-full px-1 leading-none ${active ? "text-white/70 hover:text-white" : "text-slate-400 hover:text-red-600"}`}
                >
                  ✕
                </button>
              </form>
            </span>
          );
        })}

        {/* Offer to save when filters are applied and not already saved */}
        {currentFilterStr && !alreadySaved && (
          <SaveViewButton query={currentFilterStr} back={currentHref} />
        )}
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
              <SearchSelect
                name="projectId"
                placeholder="— None —"
                searchPlaceholder="Search projects…"
                options={[{ value: "", label: "— None —" }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]}
              />
            </div>
            <div>
              <label className="label">Assignee</label>
              <SearchSelect
                name="assigneeId"
                defaultValue={String(user.id)}
                placeholder="— Unassigned —"
                searchPlaceholder="Search people…"
                options={[{ value: "", label: "— Unassigned —" }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]}
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Collaborators</label>
              <MultiSelect
                name="collaboratorIds"
                placeholder="Add people to work on this together…"
                searchPlaceholder="Search people…"
                options={users.map((u) => ({ value: String(u.id), label: u.name, hint: u.jobTitle ?? undefined }))}
              />
            </div>
            <div>
              <label className="label">Priority</label>
              <SearchSelect
                name="priority"
                defaultValue="MEDIUM"
                options={TASK_PRIORITIES.map((p) => ({ value: p.value, label: p.label }))}
              />
            </div>
            <div>
              <label className="label">Start date</label>
              <DatePicker name="startDate" />
            </div>
            <div>
              <label className="label">Due date</label>
              <DatePicker name="dueDate" />
            </div>
            <div>
              <label className="label">Repeat</label>
              <SearchSelect
                name="recurrence"
                defaultValue=""
                placeholder="Does not repeat"
                options={[
                  { value: "", label: "Does not repeat" },
                  { value: "DAILY", label: "Daily" },
                  { value: "WEEKLY", label: "Weekly" },
                  { value: "MONTHLY", label: "Monthly" },
                ]}
              />
            </div>
            <div>
              <label className="label">Estimate</label>
              <input name="estimate" className="input" placeholder="e.g. 3h or 1h 30m" />
            </div>
            <label className="flex items-start gap-2 md:col-span-2">
              <input type="checkbox" name="reviewRequired" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
              <span className="text-sm">
                <span className="font-medium">Review required</span>
                <span className="block text-xs text-slate-500">
                  The assignee can&apos;t mark this Done — they send it to Review and you approve it (you&apos;ll get an email).
                </span>
              </span>
            </label>
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
          <SearchSelect
            name="status"
            defaultValue={searchParams.status ?? ""}
            className="w-36"
            placeholder="All"
            options={[{ value: "", label: "All" }, ...TASK_STATUSES.map((s) => ({ value: s.value, label: s.label }))]}
          />
        </div>
        <div>
          <label className="label">Assignee</label>
          <SearchSelect
            name="assignee"
            defaultValue={searchParams.assignee ?? ""}
            className="w-44"
            placeholder="Everyone"
            searchPlaceholder="Search people…"
            options={[
              { value: "", label: "Everyone" },
              { value: "me", label: "My tasks" },
              ...users.map((u) => ({ value: String(u.id), label: u.name })),
            ]}
          />
        </div>
        <div>
          <label className="label">Project</label>
          <SearchSelect
            name="project"
            defaultValue={searchParams.project ?? ""}
            className="w-44"
            placeholder="All"
            searchPlaceholder="Search projects…"
            options={[{ value: "", label: "All" }, ...projects.map((p) => ({ value: String(p.id), label: p.name }))]}
          />
        </div>
        {allTags.length > 0 && (
          <div>
            <label className="label">Tag</label>
            <SearchSelect
              name="tag"
              defaultValue={searchParams.tag ?? ""}
              className="w-36"
              placeholder="All"
              searchPlaceholder="Search tags…"
              options={[{ value: "", label: "All" }, ...allTags.map((t) => ({ value: t.name, label: t.name }))]}
            />
          </div>
        )}
        <div>
          <label className="label">Sort</label>
          <SearchSelect
            name="sort"
            defaultValue={searchParams.sort ?? ""}
            className="w-48"
            placeholder="Default (status · due)"
            options={[
              { value: "", label: "Default (status · due)" },
              { value: "updated", label: "Recently updated" },
              { value: "created", label: "Recently created" },
              { value: "title", label: "Title (A–Z)" },
            ]}
          />
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
        {canManage && (
          <a
            href={exportHref}
            className="btn-secondary gap-1.5"
            title="Download the tasks matching these filters as a spreadsheet (CSV)"
          >
            <span aria-hidden>⬇</span> Export
          </a>
        )}
      </form>

      {boardView ? (
        <Board columns={TASK_STATUSES} tasks={boardTasks} moveAction={moveTask} backHref={boardHref} />
      ) : (
        <BulkTaskTable rows={listRows} users={users} projects={projects} back={listHref} />
      )}
    </div>
  );
}
