import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { TASK_PRIORITIES, lookup } from "@/lib/ui";

export const dynamic = "force-dynamic";

/** Tasks assigned to me that I haven't opened/acknowledged yet — the ones the
 *  "please confirm you've seen this" banner lists. Excludes tasks I created
 *  myself and completed ones. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ tasks: [] }, { status: 401 });

  const tasks = await db.task.findMany({
    where: {
      assigneeId: session.userId,
      createdById: { not: session.userId },
      acknowledgedAt: null,
      deletedAt: null,
      status: { not: "DONE" },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    include: { project: { select: { name: true } }, createdBy: { select: { name: true } } },
    take: 25,
  });

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      priorityLabel: lookup(TASK_PRIORITIES, t.priority).label,
      priorityBadge: lookup(TASK_PRIORITIES, t.priority).badge,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      project: t.project?.name ?? null,
      from: t.createdBy.name,
    })),
  });
}
