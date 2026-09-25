"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { stopTaskTimer } from "@/lib/actions/time";
import { fmtDuration } from "@/lib/ui";

/** After this long, a running timer asks whether you're still on the task. */
export const LONG_TIMER_HOURS = 4;
const SNOOZE_MS = 2 * 3600_000;

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked — the prompt just shows again */
  }
}

/**
 * A gentle "Still working on …?" card once a timer has run for
 * LONG_TIMER_HOURS — the case where someone forgot it while the laptop stayed
 * on (the server already auto-stops timers when the browser is closed).
 * "Yes" snoozes it for two hours; nothing is ever stopped without a click.
 */
export default function LongTimerPrompt({
  taskId,
  title,
  startedAt,
}: {
  taskId: number;
  title: string;
  startedAt: string;
}) {
  const pathname = usePathname() ?? "/dashboard";
  const [now, setNow] = useState(() => Date.now());
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  // Client-only: the live duration and the snooze (localStorage) can't match a
  // server render, so nothing shows until after mount.
  const [mounted, setMounted] = useState(false);
  const key = `timerPrompt:${startedAt}`;

  useEffect(() => {
    setSnoozedUntil(Number(read(key) ?? 0));
    setNow(Date.now());
    setMounted(true);
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [key]);

  const elapsedMs = now - new Date(startedAt).getTime();
  const due = mounted && elapsedMs >= LONG_TIMER_HOURS * 3600_000 && now >= snoozedUntil;

  // One system notification per prompt, so it's seen even from another app.
  useEffect(() => {
    if (!due) return;
    const notifiedKey = `${key}:notified:${snoozedUntil}`;
    if (read(notifiedKey)) return;
    write(notifiedKey, "1");
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Still working?", {
          body: `Your timer on “${title}” has been running for ${fmtDuration(elapsedMs / 1000)}.`,
          tag: key,
        });
      }
    } catch {
      /* notifications unsupported */
    }
  }, [due, key, snoozedUntil, title, elapsedMs]);

  if (!due) return null;

  const snooze = () => {
    const until = Date.now() + SNOOZE_MS;
    write(key, String(until));
    setSnoozedUntil(until);
  };

  return (
    <div
      role="alertdialog"
      aria-label="Timer still running"
      className="fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-amber-200 bg-white p-4 shadow-2xl print:hidden dark:border-amber-900/60 dark:bg-slate-800"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg dark:bg-amber-900/40">⏰</span>
        <div className="min-w-0">
          <div className="font-semibold">Still working on this?</div>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
            Your timer on{" "}
            <Link href={`/tasks/${taskId}`} className="font-medium text-sky-700 hover:underline dark:text-sky-400">
              {title}
            </Link>{" "}
            has been running for <span className="font-mono font-semibold tabular-nums">{fmtDuration(elapsedMs / 1000)}</span>.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={snooze} className="btn-secondary !py-1.5 text-xs">
          Yes, keep going
        </button>
        <form action={stopTaskTimer}>
          <input type="hidden" name="back" value={pathname} />
          <button type="submit" className="btn-primary !bg-red-600 !py-1.5 text-xs hover:!bg-red-700">
            ■ Stop &amp; log
          </button>
        </form>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Forgot it earlier? Stop now, then fix the hours on your{" "}
        <Link href="/timesheet" className="underline">
          Time sheet
        </Link>
        .
      </p>
    </div>
  );
}
