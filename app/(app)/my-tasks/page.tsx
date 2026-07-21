import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { setTaskStatus } from "@/lib/actions/tasks";
import { TASK_PRIORITIES, lookup, fmtDate, tagBadge } from "@/lib/ui";

export const dynamic = "force-dynamic";

type TaskRow = Awaited<ReturnType<typeof loadTasks>>[number];

function loadTasks(userId: number) {
  return db.task.findMany({
    where: { assigneeId: userId, status: { not: "DONE" } },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    include: { project: true, tags: { include: { tag: true } }, subtasks: true },
  });
}

function Section({ title, accent, tasks }: { title: string; accent: string; tasks: TaskRow[] }) {
  if (tasks.length === 0) return null;
  return (
    <div className="card">
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
                <input type="hidden" name="back" value="/my-tasks" />
                <button
                  type="submit"
                  title="Mark as done"
                  className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-300 text-transparent transition-colors hover:border-green-500 hover:bg-green-500 hover:text-white"
                >
                  ✓
                </button>
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

export default async function MyTasksPage() {
  const user = await requireUser();
  const tasks = await loadTasks(user.id);

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
            {tasks.length} open task{tasks.length === 1 ? "" : "s"} assigned to you. Click the
            circle to mark a task done.
          </p>
        </div>
        <Link href="/tasks?new=1" className="btn-primary">
          + New Task
        </Link>
      </div>

      {tasks.length === 0 && (
        <div className="card py-16 text-center text-sm text-slate-400">
          Nothing assigned to you right now.
        </div>
      )}

      <Section title="Overdue" accent="bg-red-500" tasks={overdue} />
      <Section title="Due today" accent="bg-amber-500" tasks={today} />
      <Section title="This week" accent="bg-sky-500" tasks={thisWeek} />
      <Section title="Later" accent="bg-slate-400" tasks={later} />
      <Section title="No due date" accent="bg-slate-300" tasks={noDate} />
    </div>
  );
}
