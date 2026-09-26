import { db } from "@/lib/db";

/**
 * A short fingerprint of "everything a page might show" for one person. Pages
 * poll it and only re-render when it changes, instead of re-rendering every
 * few seconds regardless. The company-wide part is shared by everyone and
 * cached for a few seconds, so many open tabs cost about one set of queries.
 */
const SHARED_TTL_MS = 4000;
const g = globalThis as unknown as { __stamp?: { at: number; value: Promise<string> } };

async function sharedStamp(): Promise<string> {
  const [task, activity, comment, time, timers, leave, attach, project] = await Promise.all([
    db.task.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.taskActivity.aggregate({ _max: { id: true } }),
    db.taskComment.aggregate({ _max: { id: true }, _count: true }),
    db.timeEntry.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.taskTimer.aggregate({ _max: { startedAt: true }, _count: true }),
    db.leave.aggregate({ _max: { updatedAt: true }, _count: true }),
    db.attachment.aggregate({ _max: { id: true }, _count: true }),
    db.project.aggregate({ _max: { updatedAt: true }, _count: true }),
  ]);
  return [
    task._max.updatedAt?.getTime(), task._count,
    activity._max.id,
    comment._max.id, comment._count,
    time._max.updatedAt?.getTime(), time._count,
    timers._max.startedAt?.getTime(), timers._count,
    leave._max.updatedAt?.getTime(), leave._count,
    attach._max.id, attach._count,
    project._max.updatedAt?.getTime(), project._count,
  ].join(".");
}

export async function changeStamp(userId: number): Promise<string> {
  const now = Date.now();
  if (!g.__stamp || now - g.__stamp.at > SHARED_TTL_MS) {
    g.__stamp = { at: now, value: sharedStamp() };
    g.__stamp.value.catch(() => (g.__stamp = undefined));
  }
  const [shared, notif, unread, dm, group] = await Promise.all([
    g.__stamp.value,
    db.notification.aggregate({ where: { userId }, _max: { id: true } }),
    db.notification.count({ where: { userId, read: false } }),
    db.directMessage.aggregate({ where: { OR: [{ senderId: userId }, { recipientId: userId }] }, _max: { id: true } }),
    db.groupMessage.aggregate({ where: { group: { members: { some: { userId } } } }, _max: { id: true } }),
  ]);
  return [shared, notif._max.id, unread, dm._max.id, group._max.id].join("|");
}
