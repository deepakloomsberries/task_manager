import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/** Marks a task as seen by its assignee. Called ~1s after the assignee opens
 *  the task, so there's a record they viewed it. Idempotent. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const id = Number(params.id);
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const task = await db.task.findFirst({
    where: { id, deletedAt: null, assigneeId: session.userId, acknowledgedAt: null },
    select: { id: true },
  });
  if (task) {
    await db.task.update({ where: { id }, data: { acknowledgedAt: new Date() } });
  }
  return NextResponse.json({ ok: true });
}
