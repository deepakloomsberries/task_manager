import { db } from "@/lib/db";
import { pushNotification } from "@/lib/notify";
import { fmtHours } from "@/lib/ui";
import { auditTimeEntry } from "@/lib/timeAudit";

/**
 * How long a running timer may go without a ping from any open tab before we
 * assume the laptop was shut down / the browser closed and stop it for them.
 */
export const TIMER_STALE_MS = 15 * 60 * 1000;

type TimerRow = { id: number; userId: number; taskId: number; note: string | null; startedAt: Date };

/**
 * Converts a running timer into a logged time entry. `endAt` defaults to now;
 * auto-stopped timers pass the last moment we knew the person was there.
 * `actorId` is who stopped it (null when the system auto-stopped it).
 * Returns the hours logged.
 */
export async function commitTimer(timer: TimerRow, endAt: Date = new Date(), actorId: number | null = timer.userId) {
  const start = new Date(timer.startedAt);
  const end = endAt > start ? endAt : start;
  const elapsedHours = (end.getTime() - start.getTime()) / 3600000;
  // Round to the nearest minute (1/60h) and never log a zero-length entry.
  const hours = Math.max(0.02, Math.round(elapsedHours * 60) / 60);
  const task = await db.task.findUnique({ where: { id: timer.taskId }, select: { projectId: true } });

  const [entry] = await db.$transaction([
    db.timeEntry.create({
      data: {
        userId: timer.userId,
        taskId: timer.taskId,
        projectId: task?.projectId ?? null,
        date: start,
        hours,
        startedAt: start,
        endedAt: end,
        note: timer.note,
        source: "timer",
      },
    }),
    db.taskTimer.delete({ where: { id: timer.id } }),
  ]);
  await auditTimeEntry(actorId === null ? "auto_stop" : "timer", actorId, null, entry);
  return hours;
}

/**
 * Stops and logs every timer whose tabs have all gone quiet (laptop shut down,
 * browser closed, machine asleep). Time is logged only up to the last ping, so
 * a forgotten timer never racks up hours overnight. Cheap enough to call on
 * every heartbeat / page render. Returns the user ids whose timer was stopped.
 */
export async function reapStaleTimers(): Promise<number[]> {
  const cutoff = new Date(Date.now() - TIMER_STALE_MS);
  const stale = await db.taskTimer.findMany({
    where: {
      OR: [
        { lastPingAt: { lt: cutoff } },
        // Timers started before pings existed: fall back to the user's presence.
        { lastPingAt: null, OR: [{ user: { lastSeenAt: null } }, { user: { lastSeenAt: { lt: cutoff } } }] },
      ],
    },
    include: { user: { select: { lastSeenAt: true } }, task: { select: { title: true } } },
  });

  const stopped: number[] = [];
  for (const t of stale) {
    const endAt = t.lastPingAt ?? t.user.lastSeenAt ?? t.startedAt;
    try {
      const hours = await commitTimer(t, endAt, null);
      stopped.push(t.userId);
      await pushNotification(
        t.userId,
        `Your timer on "${t.task.title}" was stopped automatically (browser closed / no activity) and ${fmtHours(hours)} was logged. Adjust it in Time sheet if needed.`,
        "/timesheet"
      );
    } catch {
      // Another request reaped it first — nothing to do.
    }
  }
  return stopped;
}
