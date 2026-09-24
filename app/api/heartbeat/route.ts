import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { reapStaleTimers } from "@/lib/timers";

// Lightweight presence ping. The client calls this every minute from every open
// tab (visible or not) so we can show who is currently active, everyone's "last
// seen" time, and tell a running timer apart from one left behind when the
// laptop was shut down — without hammering the database on every page render.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const visible = body?.visible !== false;

  // Reap first, so a laptop waking from a long sleep doesn't have the gap
  // counted before this ping refreshes its timer.
  const stopped = await reapStaleTimers();

  const now = new Date();
  await Promise.all([
    visible ? db.user.update({ where: { id: session.userId }, data: { lastSeenAt: now } }) : null,
    db.taskTimer.updateMany({ where: { userId: session.userId }, data: { lastPingAt: now } }),
  ]);

  return NextResponse.json({ ok: true, timerStopped: stopped.includes(session.userId) });
}
