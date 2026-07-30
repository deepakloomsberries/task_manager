import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Lightweight presence ping. The client calls this every minute (and when a tab
// regains focus) so we can show who is currently active and everyone's "last
// seen" time without hammering the database on every page render.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });

  await db.user.update({
    where: { id: session.userId },
    data: { lastSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
