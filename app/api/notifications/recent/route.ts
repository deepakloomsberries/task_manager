import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Latest notifications + unread count, for the header bell. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, message: true, link: true, read: true, createdAt: true },
    }),
    db.notification.count({ where: { userId: session.userId, read: false } }),
  ]);
  return NextResponse.json({ items, unread }, { headers: { "Cache-Control": "no-store" } });
}
