/**
 * Nightly recurring-task roll-over.
 *
 * For every recurring job (grouped by seriesId) this keeps exactly ONE live
 * instance for the current period. Each run:
 *   - closes out any elapsed instance — archiving it, and marking it MISSED if
 *     it wasn't completed,
 *   - creates the fresh instance for the new period (carrying assignee,
 *     collaborators, tags, estimate, etc.).
 * A completed instance simply archives (it stays green in the grid via its
 * completedAt); a missed one archives with missedAt set (red in the grid).
 *
 * This replaces the old "spawn a copy when marked done" behaviour, so finishing
 * early never creates a same-day duplicate, and a job nobody finishes is never
 * duplicated — it's recorded as missed and a fresh one takes its place.
 *
 * Run once each morning via cron (server timezone = the working day), e.g.:
 *
 *   5 0 * * * cd /home/kapil/task_manager && /usr/bin/npx tsx scripts/recurring.ts >> /var/log/task-recurring.log 2>&1
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { advanceDate } from "../lib/recurrence";

// Minimal .env loader so the script works standalone under cron.
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const db = new PrismaClient();

/** Start of the calendar day for a date (local server time). */
function dayStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
/**
 * The day AFTER an instance's period — when its window closes. Monthly keeps
 * the series' day of the month (31 Jan → 28 Feb → 31 Mar), never overflowing
 * into the month after.
 */
function periodEnd(due: Date, recurrence: string, anchorDay?: number | null) {
  const rec = recurrence === "WEEKLY" || recurrence === "MONTHLY" ? recurrence : "DAILY";
  return advanceDate(dayStart(due), rec, anchorDay);
}
/** Same key the app uses so legacy rows without a seriesId can be backfilled. */
function seriesKeyFor(t: { recurrence: string | null; assigneeId: number | null; title: string }) {
  if (!t.recurrence) return null;
  const norm = t.title.trim().toLowerCase().replace(/\s+/g, " ");
  return `${t.recurrence}:${t.assigneeId ?? 0}:${norm}`;
}

/** The assignee had the day off (office holiday or approved leave). */
async function excused(assigneeId: number | null, due: Date | null): Promise<boolean> {
  if (!assigneeId || !due) return false;
  const day = new Date(
    `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}T00:00:00Z`
  );
  const user = await db.user.findUnique({ where: { id: assigneeId }, select: { companyId: true } });
  const [leave, holiday] = await Promise.all([
    db.leave.count({ where: { userId: assigneeId, status: "APPROVED", startDate: { lte: day }, endDate: { gte: day } } }),
    db.holiday.count({ where: { date: day, OR: [{ companyId: null }, { companyId: user?.companyId ?? -1 }] } }),
  ]);
  return leave + holiday > 0;
}

async function main() {
  const now = new Date();

  // Self-healing backfill: any recurring task missing a seriesId gets one.
  const orphans = await db.task.findMany({
    where: { recurrence: { not: null }, seriesId: null },
    select: { id: true, recurrence: true, assigneeId: true, title: true },
  });
  for (const o of orphans) {
    await db.task.update({ where: { id: o.id }, data: { seriesId: seriesKeyFor(o) } });
  }
  if (orphans.length) console.log(`Backfilled seriesId on ${orphans.length} legacy task(s).`);

  // All live occurrences of recurring jobs, grouped by series.
  const live = await db.task.findMany({
    where: { recurrence: { not: null }, seriesId: { not: null }, deletedAt: null },
    include: { collaborators: { select: { userId: true } }, tags: { select: { tagId: true } } },
  });
  const bySeries = new Map<string, typeof live>();
  for (const t of live) {
    const arr = bySeries.get(t.seriesId!) ?? [];
    arr.push(t);
    bySeries.set(t.seriesId!, arr);
  }

  let closed = 0, missed = 0, created = 0;

  for (const group of Array.from(bySeries.values())) {
    // Newest occurrence is the one we roll forward; any older live rows in the
    // same series are stray duplicates — close them out too.
    group.sort((a, b) => (b.dueDate?.getTime() ?? 0) - (a.dueDate?.getTime() ?? 0));
    const [head, ...dups] = group;

    const close = async (t: { id: number; completedAt: Date | null; dueDate: Date | null; assigneeId: number | null }) => {
      // Not done — but not "missed" either if that day was a holiday for the
      // assignee's office or they were on approved leave.
      const wasMissed = !t.completedAt && !(await excused(t.assigneeId, t.dueDate));
      await db.task.update({
        where: { id: t.id },
        data: { deletedAt: now, missedAt: wasMissed ? (t.dueDate ?? now) : null },
      });
      closed++;
      if (wasMissed) missed++;
    };

    for (const d of dups) await close(d);

    // Roll the head forward through every elapsed period, filling any gap days
    // (e.g. if the job wasn't run for a couple of days) with missed records.
    let cur = head;
    // Guard against a runaway loop from bad data.
    for (let guard = 0; guard < 400; guard++) {
      const due = cur.dueDate ?? dayStart(now);
      // Monthly series remember their day (set on the first roll-over).
      const anchor = cur.recurrence === "MONTHLY" ? (cur.recurrenceDay ?? due.getDate()) : null;
      const end = periodEnd(due, cur.recurrence!, anchor);
      if (now < end) break; // current period is still open — leave it live.

      await close(cur);

      const next = await db.task.create({
        data: {
          title: cur.title,
          description: cur.description,
          priority: cur.priority,
          status: "TODO",
          projectId: cur.projectId,
          assigneeId: cur.assigneeId,
          createdById: cur.createdById,
          recurrence: cur.recurrence,
          seriesId: cur.seriesId,
          recurrenceDay: anchor,
          estimateHours: cur.estimateHours,
          reviewRequired: cur.reviewRequired,
          startDate: end,
          dueDate: end,
        },
        include: { collaborators: { select: { userId: true } }, tags: { select: { tagId: true } } },
      });
      created++;
      // Carry collaborators and tags onto the new occurrence.
      if (cur.collaborators.length) {
        await db.taskCollaborator.createMany({
          data: cur.collaborators.map((c) => ({ taskId: next.id, userId: c.userId })),
        });
      }
      if (cur.tags.length) {
        await db.taskTag.createMany({ data: cur.tags.map((t) => ({ taskId: next.id, tagId: t.tagId })) });
      }
      cur = { ...next };
    }
  }

  // Retention: hard-delete archived occurrences older than the grid window, so
  // the task table doesn't grow without bound. Recent history stays for the
  // Recurring grid; live occurrences are never touched.
  const RETENTION_DAYS = 180;
  const cutoff = new Date(dayStart(now));
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const purged = await db.task.deleteMany({
    where: { seriesId: { not: null }, deletedAt: { not: null }, dueDate: { lt: cutoff } },
  });

  const cleaned = await cleanUploads(now);

  console.log(
    `Done at ${now.toISOString()}: ${bySeries.size} series, ${closed} closed (${missed} missed), ${created} created, ${purged.count} old occurrence(s) purged (>${RETENTION_DAYS}d), ${cleaned} unused upload(s) removed.`
  );
}

/**
 * Housekeeping for the uploads folder:
 * - chat-box drafts (a file added to a chat box, then the message never sent)
 *   are removed after a day — Documents uploads are never touched;
 * - files on disk that no record points to any more (e.g. the attachments of
 *   purged recurring occurrences, whose rows went with the task) are deleted.
 * Only touches files older than a day, so an upload in progress is safe.
 */
async function cleanUploads(now: Date): Promise<number> {
  const dayAgo = new Date(now.getTime() - 86_400_000);
  // Only chat-box drafts: a file uploaded straight to Documents has no task or
  // message either, and must never be touched.
  const stray = await db.attachment.findMany({
    where: {
      draft: true,
      createdAt: { lt: dayAgo },
      taskId: null, messageId: null, groupMessageId: null, noteId: null, discussionMessageId: null,
    },
    select: { id: true },
  });
  if (stray.length) await db.attachment.deleteMany({ where: { id: { in: stray.map((a) => a.id) } } });

  const dir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
  if (!fs.existsSync(dir)) return stray.length;
  const [files, avatars] = await Promise.all([
    db.attachment.findMany({ where: { storedName: { not: null } }, select: { storedName: true } }),
    db.user.findMany({ where: { avatarPath: { not: null } }, select: { avatarPath: true } }),
  ]);
  const inUse = new Set<string>([...files.map((f) => f.storedName!), ...avatars.map((u) => u.avatarPath!)]);
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    if (inUse.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (!st.isFile() || st.mtime > dayAgo) continue;
    fs.unlinkSync(full);
    removed++;
  }
  return removed;
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
