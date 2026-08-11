import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Everyone with a timer running right now, for the live "working now" views. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const timers = await db.taskTimer.findMany({
    orderBy: { startedAt: "asc" },
    include: {
      user: { select: { id: true, name: true, avatarPath: true } },
      task: { select: { id: true, title: true, estimateHours: true, deletedAt: true } },
    },
  });

  return NextResponse.json({
    timers: timers
      .filter((t) => t.task && !t.task.deletedAt)
      .map((t) => ({
        id: t.id,
        userId: t.userId,
        userName: t.user.name,
        avatarPath: t.user.avatarPath,
        taskId: t.task!.id,
        taskTitle: t.task!.title,
        estimateHours: t.task!.estimateHours,
        startedAt: t.startedAt.toISOString(),
      })),
  });
}
