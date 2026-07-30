"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { stopTaskTimer, cancelTaskTimer } from "@/lib/actions/time";
import { fmtDuration } from "@/lib/ui";

/** Prominent running-timer banner for the timesheet, with stop / discard. */
export default function ActiveTimerBanner({
  taskId,
  title,
  startedAt,
}: {
  taskId: number;
  title: string;
  startedAt: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = (now - new Date(startedAt).getTime()) / 1000;

  return (
    <div className="card flex flex-wrap items-center gap-4 border-sky-200 bg-sky-50 p-4 dark:border-sky-900/60 dark:bg-sky-950/40">
      <span className="relative flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-500" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-sky-600 dark:text-sky-400">
          Currently timing
        </div>
        <Link href={`/tasks/${taskId}`} className="truncate font-semibold text-slate-800 hover:underline dark:text-slate-100">
          {title}
        </Link>
      </div>
      <span className="font-mono text-2xl font-bold tabular-nums text-sky-600 dark:text-sky-400">
        {fmtDuration(elapsed)}
      </span>
      <div className="flex gap-2">
        <form action={stopTaskTimer}>
          <input type="hidden" name="back" value="/timesheet" />
          <button type="submit" className="btn-primary !bg-red-600 hover:!bg-red-700">
            ■ Stop &amp; log
          </button>
        </form>
        <form action={cancelTaskTimer}>
          <input type="hidden" name="back" value="/timesheet" />
          <button type="submit" className="btn-secondary">
            Discard
          </button>
        </form>
      </div>
    </div>
  );
}
