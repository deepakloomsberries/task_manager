import { db } from "@/lib/db";
import { fmtHours } from "@/lib/ui";

export type AuditAction = "create" | "update" | "delete" | "timer" | "auto_stop";

type EntryLike = {
  id: number;
  userId: number;
  date: Date;
  hours: number;
  taskId: number | null;
  projectId: number | null;
  note: string | null;
  startedAt?: Date | null;
  endedAt?: Date | null;
};

/** The fields worth keeping in an audit snapshot. */
export function snapshot(e: EntryLike) {
  return JSON.stringify({
    date: e.date.toISOString(),
    hours: e.hours,
    taskId: e.taskId,
    projectId: e.projectId,
    note: e.note,
    startedAt: e.startedAt ? e.startedAt.toISOString() : null,
    endedAt: e.endedAt ? e.endedAt.toISOString() : null,
  });
}

/** Records one change to a time entry. Never throws — auditing mustn't block the edit. */
export async function auditTimeEntry(
  action: AuditAction,
  actorId: number | null,
  before: EntryLike | null,
  after: EntryLike | null
) {
  const entry = after ?? before;
  if (!entry) return;
  try {
    await db.timeEntryAudit.create({
      data: {
        timeEntryId: entry.id,
        ownerId: entry.userId,
        actorId,
        action,
        before: before ? snapshot(before) : null,
        after: after ? snapshot(after) : null,
      },
    });
  } catch (err) {
    console.error("time entry audit failed", err);
  }
}

/** One-line human summary of what changed between two snapshots. */
export function describeChange(before: string | null, after: string | null): string {
  const b = before ? JSON.parse(before) : null;
  const a = after ? JSON.parse(after) : null;
  const h = (x: number) => fmtHours(x);
  const day = (iso: string) => iso.slice(0, 10);
  if (!b && a) return `${h(a.hours)} on ${day(a.date)}`;
  if (b && !a) return `${h(b.hours)} on ${day(b.date)}`;
  if (!b || !a) return "";
  const parts: string[] = [];
  if (b.hours !== a.hours) parts.push(`hours ${h(b.hours)} → ${h(a.hours)}`);
  if (day(b.date) !== day(a.date)) parts.push(`date ${day(b.date)} → ${day(a.date)}`);
  if (b.taskId !== a.taskId) parts.push("task changed");
  if (b.projectId !== a.projectId) parts.push("project changed");
  if ((b.note ?? "") !== (a.note ?? "")) parts.push("note changed");
  if (b.startedAt !== a.startedAt || b.endedAt !== a.endedAt) parts.push("time window changed");
  return parts.join(", ") || "no field changes";
}
