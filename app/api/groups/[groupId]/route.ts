import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/**
 * Polling endpoint that powers a live group thread — mirrors
 * app/api/messages/[userId]/route.ts for 1:1 chat, minus the parts that
 * don't generalize to N members (per-message Seen/Delivered, typing,
 * translation): returns new messages, reactions/star snapshots for the
 * loaded window, and recently-deleted ids so already-loaded bubbles can
 * flip to tombstones live.
 */
export async function GET(req: NextRequest, { params }: { params: { groupId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const meId = session.userId;
  const groupId = Number(params.groupId);
  if (!groupId) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const membership = await db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: meId } } });
  if (!membership) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const after = Number(req.nextUrl.searchParams.get("after") ?? 0) || 0;

  // Looking at the thread now — clear the unread badge up to this point.
  await db.groupMember.update({ where: { groupId_userId: { groupId, userId: meId } }, data: { lastReadAt: new Date() } });

  const recentlyDeletedSince = new Date(Date.now() - 15 * 60_000);
  const groupWhere = { groupId };

  const [messages, deleted, reactionRows, starRows, members] = await Promise.all([
    db.groupMessage.findMany({
      where: { id: { gt: after }, ...groupWhere },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        attachments: { select: { id: true, originalName: true, mimeType: true, size: true }, orderBy: { id: "asc" } },
        replyTo: {
          select: { id: true, body: true, senderId: true, deletedAt: true, attachments: { select: { id: true }, take: 1 } },
        },
      },
    }),
    db.groupMessage.findMany({
      where: { deletedAt: { gte: recentlyDeletedSince }, ...groupWhere },
      select: { id: true },
    }),
    db.groupMessageReaction.findMany({
      where: { message: groupWhere },
      select: { messageId: true, userId: true, emoji: true },
    }),
    db.groupMessageStar.findMany({
      where: { userId: meId, message: groupWhere },
      select: { messageId: true },
    }),
    // Sender display needs every member's name/avatar, not just a single
    // fixed "other" the way a 1:1 thread has — sent once, cached client-side.
    db.groupMember.findMany({
      where: { groupId },
      select: { user: { select: { id: true, name: true, avatarPath: true } } },
    }),
  ]);
  const myStarredIds = new Set(starRows.map((s) => s.messageId));

  const reactionsByMessage = new Map<number, { emoji: string; count: number; mine: boolean }[]>();
  for (const r of reactionRows) {
    const list = reactionsByMessage.get(r.messageId) ?? [];
    const existing = list.find((x) => x.emoji === r.emoji);
    if (existing) {
      existing.count += 1;
      if (r.userId === meId) existing.mine = true;
    } else {
      list.push({ emoji: r.emoji, count: 1, mine: r.userId === meId });
    }
    reactionsByMessage.set(r.messageId, list);
  }

  return NextResponse.json({
    messages: messages.map((m) => {
      const isDeleted = !!m.deletedAt;
      return {
        id: m.id,
        body: isDeleted ? "" : m.body,
        senderId: m.senderId,
        createdAt: m.createdAt.toISOString(),
        deleted: isDeleted,
        attachments: isDeleted
          ? []
          : m.attachments.map((a) => ({ id: a.id, name: a.originalName, mimeType: a.mimeType, size: a.size })),
        replyTo:
          m.replyTo && !m.replyTo.deletedAt
            ? {
                id: m.replyTo.id,
                body: m.replyTo.body,
                senderId: m.replyTo.senderId,
                hasAttachment: m.replyTo.attachments.length > 0,
              }
            : null,
        reactions: reactionsByMessage.get(m.id) ?? [],
        starred: myStarredIds.has(m.id),
        forwarded: m.forwarded,
      };
    }),
    allReactions: Array.from(reactionsByMessage.entries()).map(([messageId, reactions]) => ({ messageId, reactions })),
    myStarredIds: Array.from(myStarredIds),
    members: members.map((m) => m.user),
    deletedIds: deleted.map((d) => d.id),
  });
}
