"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

export type BoardTask = {
  id: number;
  title: string;
  status: string;
  priorityLabel: string;
  priorityBadge: string;
  assigneeInitials: string | null;
  assigneeName: string | null;
  assigneeColor: string | null;
  projectName: string | null;
  dueLabel: string | null;
  overdue: boolean;
  tags: { name: string; badge: string }[];
};

type Column = { value: string; label: string };

export default function Board({
  columns,
  tasks,
  moveAction,
}: {
  columns: Column[];
  tasks: BoardTask[];
  moveAction: (taskId: number, status: string) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Optimistic placement so the card lands instantly while the server confirms.
  const [moved, setMoved] = useState<Record<number, string>>({});

  const statusOf = (t: BoardTask) => moved[t.id] ?? t.status;

  function onDrop(e: React.DragEvent, status: string) {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData("text/task-id"));
    if (!id) return;
    setMoved((m) => ({ ...m, [id]: status }));
    startTransition(() => moveAction(id, status));
  }

  return (
    <div className={`grid gap-4 md:grid-cols-2 xl:grid-cols-4 ${isPending ? "opacity-90" : ""}`}>
      {columns.map((col) => {
        const colTasks = tasks.filter((t) => statusOf(t) === col.value);
        return (
          <div
            key={col.value}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(col.value);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => onDrop(e, col.value)}
            className={`flex min-h-[300px] flex-col rounded-xl border bg-slate-50/60 p-3 transition-colors ${
              dragOver === col.value ? "border-sky-400 bg-sky-50" : "border-slate-200"
            }`}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-sm font-semibold text-slate-700">{col.label}</span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                {colTasks.length}
              </span>
            </div>
            <div className="flex-1 space-y-2">
              {colTasks.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/task-id", String(t.id))}
                  className="cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow active:cursor-grabbing"
                >
                  <Link
                    href={`/tasks/${t.id}`}
                    className="block text-sm font-medium text-slate-800 hover:text-sky-700"
                  >
                    {t.title}
                  </Link>
                  {t.projectName && (
                    <div className="mt-0.5 text-xs text-slate-400">{t.projectName}</div>
                  )}
                  {t.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {t.tags.map((tag) => (
                        <span
                          key={tag.name}
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tag.badge}`}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${t.priorityBadge}`}
                    >
                      {t.priorityLabel}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {t.dueLabel && (
                        <span
                          className={`text-[10px] ${
                            t.overdue ? "font-semibold text-red-600" : "text-slate-400"
                          }`}
                        >
                          {t.dueLabel}
                        </span>
                      )}
                      {t.assigneeInitials && (
                        <span
                          title={t.assigneeName ?? undefined}
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white ${t.assigneeColor ?? "bg-sky-600"}`}
                        >
                          {t.assigneeInitials}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {colTasks.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
                  Drop tasks here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
