"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { rescheduleTask } from "@/lib/actions/tasks";
import { lookup, TASK_STATUSES, fmtDate } from "@/lib/ui";

type TLTask = {
  id: number;
  title: string;
  status: string;
  createdAt: Date | string;
  startDate?: Date | string | null;
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
 * A lightweight, dependency-aware Gantt for a project's tasks. Each dated task
 * is a status-coloured bar across a shared date axis; blocked tasks are flagged.
 * When `canReschedule` is set, bars can be dragged horizontally to change the
 * task's due date (snapped to whole days). Pure CSS — no chart library.
 */
export default function ProjectTimeline({
  tasks,
  blockersByTask,
  projectStart,
  canReschedule = false,
}: {
  tasks: TLTask[];
  blockersByTask: Record<number, { title: string; status: string }[]>;
  projectStart: Date | string;
  canReschedule?: boolean;
}) {
  const dated = tasks.filter((t) => t.dueDate);
  const undatedCount = tasks.length - dated.length;

  // --- date window --------------------------------------------------------
  const startCandidates = [new Date(projectStart).getTime()];
  const endCandidates: number[] = [Date.now()];
  for (const t of dated) {
    startCandidates.push(new Date(t.startDate ?? t.createdAt).getTime());
    endCandidates.push(new Date(t.dueDate as Date).getTime());
  }
  const min = (dated.length ? Math.min(...startCandidates) : Date.now()) - DAY;
  const max = (dated.length ? Math.max(...endCandidates) : Date.now()) + DAY;
  const span = Math.max(DAY, max - min);
  const pos = (d: number) => ((d - min) / span) * 100;

  // --- drag-to-reschedule -------------------------------------------------
  const [drag, setDrag] = useState<{ id: number; offset: number } | null>(null);
  const [isPending, startTransition] = useTransition();
  const dragRef = useRef<{ id: number; startX: number; trackW: number; createdMs: number; dueMs: number } | null>(null);
  const spanRef = useRef(span);
  spanRef.current = span;

  useEffect(() => {
    function move(e: PointerEvent) {
      if (dragRef.current) setDrag({ id: dragRef.current.id, offset: e.clientX - dragRef.current.startX });
    }
    function up(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      setDrag(null);
      const deltaDays = Math.round(((e.clientX - d.startX) / d.trackW) * (spanRef.current / DAY));
      if (deltaDays === 0) return;
      let newDue = d.dueMs + deltaDays * DAY;
      if (newDue < d.createdMs) newDue = d.createdMs;
      startTransition(() => rescheduleTask(d.id, new Date(newDue).toISOString()));
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  function onBarPointerDown(e: React.PointerEvent, id: number, createdMs: number, dueMs: number) {
    if (!canReschedule) return;
    e.preventDefault();
    const track = (e.currentTarget as HTMLElement).parentElement;
    if (!track) return;
    dragRef.current = { id, startX: e.clientX, trackW: track.clientWidth, createdMs, dueMs };
    setDrag({ id, offset: 0 });
  }

  if (dated.length === 0) {
    return (
      <p className="text-sm text-slate-400">
        No tasks with due dates yet — set due dates to see them on the timeline.
      </p>
    );
  }

  const ticks = Array.from({ length: 6 }, (_, i) => {
    const t = min + (span * i) / 5;
    return { left: (i / 5) * 100, label: fmtDate(new Date(t)) };
  });
  const todayLeft = pos(Date.now());
  const showToday = todayLeft >= 0 && todayLeft <= 100;

  return (
    <div className="overflow-x-auto">
      <div className={`min-w-[640px] ${isPending ? "opacity-70" : ""}`}>
        <div className="relative mb-2 ml-48 h-5 border-b border-slate-200 text-[10px] text-slate-400">
          {ticks.map((tk, i) => (
            <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${tk.left}%` }}>
              {tk.label}
            </span>
          ))}
        </div>

        <div className="space-y-1.5">
          {dated.map((t) => {
            const start = new Date(t.startDate ?? t.createdAt).getTime();
            const due = new Date(t.dueDate as Date).getTime();
            const barStart = Math.min(start, due);
            const barEnd = Math.max(start, due);
            const left = pos(barStart);
            const width = Math.max(2, pos(barEnd) - left);
            const st = lookup(TASK_STATUSES, t.status);
            const blocked = (blockersByTask[t.id] ?? []).some((b) => b.status !== "DONE");
            const dragging = drag?.id === t.id;

            return (
              <div key={t.id} className="flex items-center gap-2">
                <Link
                  href={`/tasks/${t.id}`}
                  className="shrink-0 truncate text-xs font-medium hover:text-sky-700"
                  style={{ width: "12rem" }}
                  title={t.title}
                >
                  {blocked && <span title="Blocked">⛔ </span>}
                  {t.title}
                </Link>
                <div className="relative h-6 flex-1">
                  {showToday && (
                    <div
                      className="absolute top-0 z-0 h-full border-l border-dashed border-rose-400/70"
                      style={{ left: `${todayLeft}%` }}
                      title="Today"
                    />
                  )}
                  <div
                    onPointerDown={(e) => onBarPointerDown(e, t.id, start, due)}
                    className={`absolute top-1 h-4 rounded ${BAR[t.status] ?? "bg-slate-400"} ${
                      blocked ? "ring-1 ring-red-500 ring-offset-1" : ""
                    } ${canReschedule ? "cursor-grab active:cursor-grabbing" : ""} ${
                      dragging ? "z-20 shadow-md ring-2 ring-sky-400" : "z-10"
                    }`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      transform: dragging ? `translateX(${drag!.offset}px)` : undefined,
                      touchAction: "none",
                    }}
                    title={`${st.label} · due ${fmtDate(t.dueDate)}${canReschedule ? " · drag to reschedule" : ""}`}
                  />
                </div>
              </div>
            );
          })}
        </div>

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
          {canReschedule && <span className="text-slate-400">· drag a bar to reschedule</span>}
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
