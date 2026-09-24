"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fmtDuration } from "@/lib/ui";
import { LONG_TIMER_HOURS } from "@/components/LongTimerPrompt";

/** Compact live timer shown in the top bar whenever a task is being timed. */
export default function RunningTimerPill({
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
  const long = elapsed >= LONG_TIMER_HOURS * 3600;

  return (
    <Link
      href={`/tasks/${taskId}`}
      title={long ? `Still running after ${LONG_TIMER_HOURS}h+ — forgot to stop it? (${title})` : `Timing: ${title}`}
      className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium sm:inline-flex ${
        long
          ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
          : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900/60 dark:bg-sky-950/50 dark:text-sky-300"
      }`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
      </span>
      {/* The seconds tick between server render and hydration; that's expected. */}
      <span className="font-mono tabular-nums" suppressHydrationWarning>
        {fmtDuration(elapsed)}
      </span>
      <span className="max-w-[9rem] truncate text-sky-600/80 dark:text-sky-300/80">{title}</span>
    </Link>
  );
}
