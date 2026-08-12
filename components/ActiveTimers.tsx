"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import UserAvatar from "@/components/UserAvatar";
import RunningTimerBadge from "@/components/RunningTimerBadge";
import LiveElapsed from "@/components/LiveElapsed";

export type ActiveTimer = {
  id: number;
  userId: number;
  userName: string;
  avatarPath: string | null;
  taskId: number;
  taskTitle: string;
  estimateHours: number | null;
  startedAt: string;
};

/** Polls the active-timers endpoint every 30s (and on tab focus). */
function usePolledTimers(initial: ActiveTimer[]) {
  const [timers, setTimers] = useState<ActiveTimer[]>(initial);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/active-timers", { cache: "no-store" });
        if (!res.ok || !active) return;
        const data = await res.json();
        setTimers(data.timers as ActiveTimer[]);
      } catch {
        /* transient — try again next tick */
      }
    };
    const id = setInterval(poll, 30000);
    const onVis = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return timers;
}

// --- Workload: one poll shared across all rows via context --------------------

const Ctx = createContext<ActiveTimer[]>([]);

export function ActiveTimersProvider({ initial, children }: { initial: ActiveTimer[]; children: React.ReactNode }) {
  const timers = usePolledTimers(initial);
  return <Ctx.Provider value={timers}>{children}</Ctx.Provider>;
}

/** A per-person cell that shows their running timer (or nothing). */
export function WorkingCell({ userId }: { userId: number }) {
  const timers = useContext(Ctx);
  const t = timers.find((x) => x.userId === userId);
  if (!t) return null;
  return (
    <div className="mt-1.5">
      <RunningTimerBadge taskId={t.taskId} title={t.taskTitle} startedAt={t.startedAt} estimateHours={t.estimateHours} />
    </div>
  );
}

// --- Self-polling card for the dashboard and task detail ----------------------

export function LiveWorkingCard({
  initial,
  title,
  taskId,
  excludeUserId,
  onlyUserId,
  showTask = true,
}: {
  initial: ActiveTimer[];
  title: string;
  taskId?: number;
  excludeUserId?: number;
  onlyUserId?: number;
  showTask?: boolean;
}) {
  const timers = usePolledTimers(initial);
  const filtered = timers.filter(
    (t) =>
      (taskId ? t.taskId === taskId : true) &&
      (excludeUserId ? t.userId !== excludeUserId : true) &&
      (onlyUserId ? t.userId === onlyUserId : true)
  );
  if (filtered.length === 0) return null;

  return (
    <div className="card">
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        <h2 className="font-semibold">{title}</h2>
        <span className="text-sm font-normal text-slate-400">({filtered.length})</span>
      </div>
      <div className="divide-y divide-slate-100">
        {filtered.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <Link
              href={`/people/${t.userId}`}
              title={`View ${t.userName}'s profile`}
              className="flex items-center gap-2 hover:underline"
            >
              <UserAvatar user={{ id: t.userId, name: t.userName, avatarPath: t.avatarPath }} size={28} />
              <span className={`text-sm font-medium ${showTask ? "w-32 shrink-0 truncate" : ""}`}>
                {t.userName}
              </span>
            </Link>
            {showTask ? (
              <RunningTimerBadge taskId={t.taskId} title={t.taskTitle} startedAt={t.startedAt} estimateHours={t.estimateHours} />
            ) : (
              <LiveElapsed startedAt={t.startedAt} className="text-sm text-sky-600" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
