import Link from "next/link";
import { lookup, TASK_STATUSES, fmtDate } from "@/lib/ui";

type TLTask = {
  id: number;
  title: string;
  status: string;
  createdAt: Date | string;
  dueDate: Date | string | null;
};

const BAR: Record<string, string> = {
  TODO: "bg-slate-400",
  IN_PROGRESS: "bg-blue-500",
  REVIEW: "bg-amber-500",
  DONE: "bg-green-500",
};

const DAY = 86400000;

/**
 * A lightweight, dependency-aware Gantt for a project's tasks. Each task with a
 * due date is drawn as a bar from its start (created) to its due date, coloured
 * by status; blocked tasks are flagged and annotated with what they wait on.
 * Pure CSS — no chart library — so it renders on the server and scrolls on
 * small screens.
 */
export default function ProjectTimeline({
  tasks,
  blockersByTask,
  projectStart,
}: {
  tasks: TLTask[];
  blockersByTask: Record<number, { title: string; status: string }[]>;
  projectStart: Date | string;
}) {
  const dated = tasks.filter((t) => t.dueDate);
  const undatedCount = tasks.length - dated.length;

  if (dated.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No tasks with due dates yet — set due dates to see them on the timeline.
      </p>
    );
  }

  // Overall window: earliest start → latest due, padded by a day each side.
  const startCandidates = [new Date(projectStart).getTime()];
  const endCandidates: number[] = [Date.now()];
  for (const t of dated) {
    startCandidates.push(new Date(t.createdAt).getTime());
    endCandidates.push(new Date(t.dueDate as Date).getTime());
  }
  const min = Math.min(...startCandidates) - DAY;
  const max = Math.max(...endCandidates) + DAY;
  const span = Math.max(DAY, max - min);
  const pos = (d: number) => ((d - min) / span) * 100;

  // ~6 evenly spaced date ticks along the top.
  const ticks = Array.from({ length: 6 }, (_, i) => {
    const t = min + (span * i) / 5;
    return { left: (i / 5) * 100, label: fmtDate(new Date(t)) };
  });

  const todayLeft = pos(Date.now());
  const showToday = todayLeft >= 0 && todayLeft <= 100;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Axis */}
        <div className="relative mb-2 ml-48 h-5 border-b border-slate-200 text-[10px] text-slate-400">
          {ticks.map((tk, i) => (
            <span
              key={i}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${tk.left}%` }}
            >
              {tk.label}
            </span>
          ))}
        </div>

        <div className="space-y-1.5">
          {dated.map((t) => {
            const created = new Date(t.createdAt).getTime();
            const due = new Date(t.dueDate as Date).getTime();
            const barStart = Math.min(created, due);
            const barEnd = Math.max(created, due);
            const left = pos(barStart);
            const width = Math.max(2, pos(barEnd) - left);
            const st = lookup(TASK_STATUSES, t.status);
            const blockers = blockersByTask[t.id] ?? [];
            const openBlockers = blockers.filter((b) => b.status !== "DONE");
            const blocked = openBlockers.length > 0;

            return (
              <div key={t.id} className="flex items-center gap-2">
                <Link
                  href={`/tasks/${t.id}`}
                  className="w-46 shrink-0 truncate text-xs font-medium hover:text-sky-700"
                  style={{ width: "12rem" }}
                  title={t.title}
                >
                  {blocked && <span title="Blocked">⛔ </span>}
                  {t.title}
                </Link>
                <div className="relative h-6 flex-1">
                  {showToday && (
                    <div
                      className="absolute top-0 z-10 h-full border-l border-dashed border-rose-400/70"
                      style={{ left: `${todayLeft}%` }}
                      title="Today"
                    />
                  )}
                  <div
                    className={`absolute top-1 flex h-4 items-center rounded ${BAR[t.status] ?? "bg-slate-400"} ${
                      blocked ? "ring-1 ring-red-500 ring-offset-1" : ""
                    }`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${st.label} · due ${fmtDate(t.dueDate)}${
                      openBlockers.length ? ` · after ${openBlockers.map((b) => b.title).join(", ")}` : ""
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-3 ml-48 flex flex-wrap gap-3 text-[11px] text-slate-500">
          {TASK_STATUSES.map((s) => (
            <span key={s.value} className="flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-sm ${BAR[s.value]}`} />
              {s.label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm ring-1 ring-red-500" />
            Blocked
          </span>
        </div>

        {undatedCount > 0 && (
          <p className="mt-2 ml-48 text-[11px] text-slate-400">
            {undatedCount} task{undatedCount === 1 ? "" : "s"} without a due date not shown.
          </p>
        )}
      </div>
    </div>
  );
}
