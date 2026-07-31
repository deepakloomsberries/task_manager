"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { startTaskTimer, stopTaskTimer, cancelTaskTimer } from "@/lib/actions/time";
import { fmtDuration, fmtHours } from "@/lib/ui";

/** Live seconds elapsed since an ISO start time, ticking every second. */
function useElapsed(startedAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return 0;
  return (now - new Date(startedAt).getTime()) / 1000;
}

export default function TaskTimer({
  taskId,
  loggedHours,
  runningStartedAt,
  otherTimer,
}: {
  taskId: number;
  loggedHours: number;
  /** ISO start time when THIS task is being timed, else null. */
  runningStartedAt: string | null;
  /** Set when the user is currently timing a DIFFERENT task. */
  otherTimer: { taskId: number; title: string } | null;
}) {
  const elapsed = useElapsed(runningStartedAt);
  const back = `/tasks/${taskId}`;
  const running = !!runningStartedAt;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-full ${running ? "bg-sky-100 text-sky-600 dark:bg-sky-900/50 dark:text-sky-300" : "bg-slate-100 text-slate-500 dark:bg-slate-700"}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2 2" />
              <path d="M5 3 2 6" />
              <path d="m22 6-3-3" />
            </svg>
          </span>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Time tracking</div>
            <div className="flex items-baseline gap-2">
              <span className={`font-mono text-2xl font-bold tabular-nums ${running ? "text-sky-600 dark:text-sky-400" : "text-slate-800 dark:text-slate-100"}`}>
                {running ? fmtDuration(elapsed) : fmtHours(loggedHours)}
              </span>
              {running ? (
                <span className="flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
                  </span>
                  recording
                </span>
              ) : (
                <span className="text-xs text-slate-400">logged so far</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {running ? (
            <>
              <form action={stopTaskTimer}>
                <input type="hidden" name="back" value={back} />
                <button type="submit" className="btn-primary !bg-red-600 hover:!bg-red-700">
                  ■ Stop &amp; log
                </button>
              </form>
              <form action={cancelTaskTimer}>
                <input type="hidden" name="back" value={back} />
                <button type="submit" className="btn-secondary" title="Discard without logging">
                  Discard
                </button>
              </form>
            </>
          ) : (
            <form action={startTaskTimer}>
              <input type="hidden" name="taskId" value={taskId} />
              <input type="hidden" name="back" value={back} />
              <button type="submit" className="btn-primary">
                ▶ {otherTimer ? "Switch timer here" : "Start timer"}
              </button>
            </form>
          )}
        </div>
      </div>

      {!running && otherTimer && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-700">
          You&apos;re currently timing{" "}
          <Link href={`/tasks/${otherTimer.taskId}`} className="font-medium text-sky-600 hover:underline">
            {otherTimer.title}
          </Link>
          . Starting here will log that time and switch over.
        </p>
      )}
    </div>
  );
}
