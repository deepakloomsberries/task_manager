import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { setTaskStatus } from "@/lib/actions/tasks";
import { TASK_PRIORITIES, lookup, fmtDate, tagBadge } from "@/lib/ui";
import ConfirmButton from "@/components/ConfirmButton";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

type TaskRow = Awaited<ReturnType<typeof loadTasks>>[number];
type MyFilter = "all" | "assigned" | "collab";

function loadTasks(userId: number, filter: MyFilter) {
  // "assigned" → tasks I own; "collab" → tasks I'm a collaborator on;
  // "all" → either.
  const scope =
    filter === "assigned"
      ? { assigneeId: userId }
      : filter === "collab"
        ? { collaborators: { some: { userId } } }
        : { OR: [{ assigneeId: userId }, { collaborators: { some: { userId } } }] };

  return db.task.findMany({
    where: {
      status: { not: "DONE" },
      deletedAt: null,
      ...scope,
    },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    include: {
      project: true,
      tags: { include: { tag: true } },
      subtasks: { where: { deletedAt: null } },
    },
  });
}

function Section({ title, accent, tasks, back }: { title: string; accent: string; tasks: TaskRow[]; back: string }) {
  if (tasks.length === 0) return null;
  return (
    <div className="card">
      <AutoRefresh />
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
        <span className={`h-2 w-2 rounded-full ${accent}`} />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-slate-400">({tasks.length})</span>
      </div>
      <div className="divide-y divide-slate-100">
        {tasks.map((t) => {
          const priority = lookup(TASK_PRIORITIES, t.priority);
          const doneSubs = t.subtasks.filter((s) => s.status === "DONE").length;
          return (
            <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
              <form action={setTaskStatus}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="status" value="DONE" />
                <input type="hidden" name="back" value={back} />
                <ConfirmButton
                  tone="primary"
                  title="Mark as done"
                  message={`Mark "${t.title}" as done?`}
                  confirmLabel="Mark done"
                  className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-300 text-transparent transition-colors hover:border-green-500 hover:bg-green-500 hover:text-white"
                >
                  ✓
                </ConfirmButton>
              </form>
              <div className="min-w-0 flex-1">
                <Link href={`/tasks/${t.id}`} className="text-sm font-medium hover:text-sky-700">
                  {t.title}
                </Link>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {t.project && <span>{t.project.name}</span>}
                  {t.subtasks.length > 0 && (
                    <span>
                      {doneSubs}/{t.subtasks.length} subtasks
                    </span>
                  )}
                  {t.tags.map(({ tag }) => (
                    <span
                      key={tag.id}
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tagBadge(tag.color)}`}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              </div>
              <span className={`badge ${priority.badge}`}>{priority.label}</span>
              <span className="w-24 text-right text-xs text-slate-500">{fmtDate(t.dueDate)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const user = await requireUser();
  const filter: MyFilter =
    searchParams.filter === "assigned" || searchParams.filter === "collab"
      ? searchParams.filter
      : "all";
  const tasks = await loadTasks(user.id, filter);
  const back = filter === "all" ? "/my-tasks" : `/my-tasks?filter=${filter}`;

  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);

  const overdue = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date(now.toDateString()));
  const today = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) >= new Date(now.toDateString()) && new Date(t.dueDate) < todayEnd
  );
  const thisWeek = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) >= todayEnd && new Date(t.dueDate) < weekEnd
  );
  const later = tasks.filter((t) => t.dueDate && new Date(t.dueDate) >= weekEnd);
  const noDate = tasks.filter((t) => !t.dueDate);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Tasks</h1>
          <p className="text-sm text-slate-500">
            {tasks.length} open task{tasks.length === 1 ? "" : "s"}. Click the circle to mark a
            task done.
          </p>
        </div>
        <Link href="/tasks?new=1" className="btn-primary">
          + New Task
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { key: "all", label: "All my tasks" },
            { key: "assigned", label: "Assigned to me" },
            { key: "collab", label: "Collaborating" },
          ] as const
        ).map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/my-tasks" : `/my-tasks?filter=${f.key}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === f.key
                ? "bg-sky-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {tasks.length === 0 && (
        <div className="card py-16 text-center text-sm text-slate-400">
          {filter === "assigned"
            ? "Nothing assigned to you right now."
            : filter === "collab"
              ? "You're not collaborating on any open tasks right now."
              : "Nothing on your plate right now."}
        </div>
      )}

      <Section title="Overdue" accent="bg-red-500" tasks={overdue} back={back} />
      <Section title="Due today" accent="bg-amber-500" tasks={today} back={back} />
      <Section title="This week" accent="bg-sky-500" tasks={thisWeek} back={back} />
      <Section title="Later" accent="bg-slate-400" tasks={later} back={back} />
      <Section title="No due date" accent="bg-slate-300" tasks={noDate} back={back} />
    </div>
  );
}
