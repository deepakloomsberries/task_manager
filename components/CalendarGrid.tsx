"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { rescheduleTask } from "@/lib/actions/tasks";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const pad = (n: number) => String(n).padStart(2, "0");

export type CalTask = {
  id: number;
  title: string;
  status: string;
  badge: string;
  assigneeName: string | null;
  day: number;
  editable: boolean;
};

/**
 * Month grid of tasks by due date. Editable tasks can be dragged from one day
 * to another to reschedule them (HTML5 drag-and-drop, like the board), with an
 * optimistic move while the server confirms via rescheduleTask.
 */
export default function CalendarGrid({
  year,
  month,
  todayDay,
  tasks,
}: {
  year: number;
  month: number; // 0-based
  todayDay: number | null;
  tasks: CalTask[];
}) {
  const [moves, setMoves] = useState<Record<number, number>>({});
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (openDay === null) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpenDay(null);
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [openDay]);

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay = new Map<number, CalTask[]>();
  for (const t of tasks) {
    const d = moves[t.id] ?? t.day;
    byDay.set(d, [...(byDay.get(d) ?? []), t]);
  }

  const onDrop = (e: React.DragEvent, day: number | null) => {
    e.preventDefault();
    setDragOver(null);
    if (!day) return;
    const id = Number(e.dataTransfer.getData("text/task-id"));
    if (!id) return;
    setMoves((m) => ({ ...m, [id]: day }));
    startTransition(() => rescheduleTask(id, `${year}-${pad(month + 1)}-${pad(day)}`));
  };

  return (
    <div className={`card overflow-x-auto ${isPending ? "opacity-90" : ""}`}>
      <div className="grid min-w-[840px] grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-w-[840px] grid-cols-7">
        {cells.map((day, i) => (
          <div
            key={i}
            onDragOver={(e) => {
              if (day) {
                e.preventDefault();
                setDragOver(day);
              }
            }}
            onDragLeave={() => setDragOver((d) => (d === day ? null : d))}
            onDrop={(e) => onDrop(e, day)}
            className={`min-h-28 border-b border-r border-slate-100 p-2 transition-colors ${
              day === null ? "bg-slate-50/50" : dragOver === day ? "bg-sky-50" : ""
            }`}
          >
            {day !== null && (
              <>
                <div
                  className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    todayDay === day ? "bg-sky-600 text-white" : "text-slate-500"
                  }`}
                >
                  {day}
                </div>
                <div className="space-y-1">
                  {(byDay.get(day) ?? []).slice(0, 4).map((t) => (
                    <Link
                      key={t.id}
                      href={`/tasks/${t.id}`}
                      draggable={t.editable}
                      onDragStart={(e) => t.editable && e.dataTransfer.setData("text/task-id", String(t.id))}
                      title={`${t.title}${t.assigneeName ? ` — ${t.assigneeName}` : ""}${t.editable ? " · drag to reschedule" : ""}`}
                      className={`block truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        t.status === "DONE" ? "bg-green-50 text-green-700 line-through" : t.badge
                      } ${t.editable ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      {t.title}
                    </Link>
                  ))}
                  {(byDay.get(day)?.length ?? 0) > 4 && (
                    <button
                      type="button"
                      onClick={() => setOpenDay(day)}
                      className="block w-full rounded px-1.5 py-0.5 text-left text-[10px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
                    >
                      +{byDay.get(day)!.length - 4} more
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {openDay !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setOpenDay(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">
                {MONTHS[month]} {openDay}, {year}
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {(byDay.get(openDay) ?? []).length} task{(byDay.get(openDay) ?? []).length === 1 ? "" : "s"}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setOpenDay(null)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[60vh] space-y-1 overflow-y-auto">
              {(byDay.get(openDay) ?? []).map((t) => (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  onClick={() => setOpenDay(null)}
                  title={t.assigneeName ? `${t.title} — ${t.assigneeName}` : t.title}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm ${
                    t.status === "DONE"
                      ? "bg-green-50 text-green-700 line-through dark:bg-green-950/40"
                      : "hover:bg-slate-50 dark:hover:bg-slate-700"
                  }`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${t.badge}`} />
                  <span className="flex-1 truncate">{t.title}</span>
                  {t.assigneeName && (
                    <span className="shrink-0 text-xs text-slate-400">{t.assigneeName}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
