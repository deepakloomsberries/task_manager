import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/**
 * Polling endpoint that powers the live chat thread. Returns any messages newer
 * than `after`, marks the partner's messages to us as read (so their side can
 * show "Seen"), and reports the partner's presence so the header stays live.
 */
export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const meId = session.userId;
  const otherId = Number(params.userId);
  if (!otherId || otherId === meId) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const after = Number(req.nextUrl.searchParams.get("after") ?? 0) || 0;

  // Mark everything the partner has sent us as read now that we're looking.
  await db.directMessage.updateMany({
    where: { senderId: otherId, recipientId: meId, read: false },
    data: { read: true },
  });

  const [messages, lastRead, partner] = await Promise.all([
    db.directMessage.findMany({
      where: {
        id: { gt: after },
        OR: [
          { senderId: meId, recipientId: otherId },
          { senderId: otherId, recipientId: meId },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    // The highest id among OUR messages that the partner has already read.
    db.directMessage.findFirst({
      where: { senderId: meId, recipientId: otherId, read: true },
      orderBy: { id: "desc" },
      select: { id: true },
    }),
    db.user.findUnique({ where: { id: otherId }, select: { lastSeenAt: true } }),
  ]);

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      senderId: m.senderId,
      createdAt: m.createdAt.toISOString(),
    })),
    lastReadMyId: lastRead?.id ?? 0,
    partnerLastSeenAt: partner?.lastSeenAt ? partner.lastSeenAt.toISOString() : null,
  });
}
