"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import ConfirmDialog from "@/components/ConfirmDialog";

export type BoardTask = {
  id: number;
  title: string;
  status: string;
  priorityLabel: string;
  priorityBadge: string;
  assigneeId: number | null;
  assigneeInitials: string | null;
  assigneeName: string | null;
  assigneeColor: string | null;
  projectName: string | null;
  dueLabel: string | null;
  overdue: boolean;
  blocked?: boolean;
  canMove: boolean;
  tags: { name: string; badge: string }[];
};

type Column = { value: string; label: string };

export default function Board({
  columns,
  tasks,
  moveAction,
  backHref,
}: {
  columns: Column[];
  tasks: BoardTask[];
  moveAction: (taskId: number, status: string) => Promise<void>;
  backHref?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<string | null>(null);
  // Optimistic placement so the card lands instantly while the server confirms.
  const [moved, setMoved] = useState<Record<number, string>>({});
  // A reopen (Done → earlier column) waits on a confirmation before applying.
  const [pending, setPending] = useState<{ id: number; status: string; title: string } | null>(null);

  const statusOf = (t: BoardTask) => moved[t.id] ?? t.status;

  function applyMove(id: number, status: string) {
    setMoved((m) => ({ ...m, [id]: status }));
    startTransition(() => moveAction(id, status));
  }

  function onDrop(e: React.DragEvent, status: string) {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData("text/task-id"));
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || statusOf(task) === status) return;
    // Reopening a completed card is a revert — confirm before moving it back.
    if (task && statusOf(task) === "DONE" && status !== "DONE") {
      setPending({ id, status, title: task.title });
      return;
    }
    applyMove(id, status);
  }

  const pendingLabel = pending ? columns.find((c) => c.value === pending.status)?.label ?? pending.status : "";

  return (
    <>
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
                  draggable={t.canMove}
                  onDragStart={(e) =>
                    t.canMove && e.dataTransfer.setData("text/task-id", String(t.id))
                  }
                  title={t.canMove ? "Drag to move" : "Only the assignee can move this task"}
                  className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow ${
                    t.canMove ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-slate-400">TM-{t.id}</span>
                    {t.blocked && (
                      <span
                        title="Blocked by an unfinished task"
                        className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-700"
                      >
                        ⛔ Blocked
                      </span>
                    )}
                  </div>
                  <Link
                    href={backHref ? `/tasks/${t.id}?back=${encodeURIComponent(backHref)}` : `/tasks/${t.id}`}
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
                      {t.assigneeInitials &&
                        (t.assigneeId ? (
                          <Link
                            href={`/people/${t.assigneeId}`}
                            title={`View ${t.assigneeName ?? "assignee"}'s profile`}
                            onClick={(e) => e.stopPropagation()}
                            draggable={false}
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white ${t.assigneeColor ?? "bg-sky-600"}`}
                          >
                            {t.assigneeInitials}
                          </Link>
                        ) : (
                          <span
                            title={t.assigneeName ?? undefined}
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white ${t.assigneeColor ?? "bg-sky-600"}`}
                          >
                            {t.assigneeInitials}
                          </span>
                        ))}
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
    <ConfirmDialog
      open={pending !== null}
      tone="primary"
      confirmLabel="Reopen"
      message={pending ? `Reopen "${pending.title}"? It will move back to ${pendingLabel}.` : ""}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        if (pending) applyMove(pending.id, pending.status);
        setPending(null);
      }}
    />
    </>
  );
}
