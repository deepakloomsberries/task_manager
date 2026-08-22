"use client";

import Link from "next/link";
import LiveElapsed from "@/components/LiveElapsed";
import { fmtHours } from "@/lib/ui";

/**
 * A live "working on this now" pill: pulsing dot, the task (TM-id + title),
 * the running elapsed time, and the estimate. Links to the task.
 */
export default function RunningTimerBadge({
  taskId,
  title,
  startedAt,
  estimateHours,
  className = "",
}: {
  taskId: number;
  title: string;
  startedAt: string;
  estimateHours?: number | null;
  className?: string;
}) {
  return (
    <Link
      href={`/tasks/${taskId}`}
      title={`Working on TM-${taskId} · ${title}`}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700 ring-1 ring-green-200 hover:bg-green-100 dark:bg-green-950/40 dark:text-green-300 dark:ring-green-900 ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
      </span>
      <span className="min-w-0 truncate">
        <span className="font-mono text-green-600/80 dark:text-green-400/80">TM-{taskId}</span> {title}
      </span>
      <LiveElapsed startedAt={startedAt} className="shrink-0 font-semibold tabular-nums" />
      {estimateHours ? <span className="shrink-0 text-green-600/70 dark:text-green-400/70">/ {fmtHours(estimateHours)}</span> : null}
    </Link>
  );
}
