import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isTyping } from "@/lib/typing";
import { PRESENCE_SELECT } from "@/lib/presence";

/**
 * Polling endpoint that powers the live chat thread. Returns any messages newer
 * than `after`, marks the partner's messages to us as read (so their side can
 * show "Seen"), and reports the partner's presence so the header stays live.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;
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

  const recentlyDeletedSince = new Date(Date.now() - 15 * 60_000);
  const conversationWhere = {
    OR: [
      { senderId: meId, recipientId: otherId },
      { senderId: otherId, recipientId: meId },
    ],
  };

  const recentlyTranslatedSince = new Date(Date.now() - 5 * 60_000);

  const [messages, lastRead, partner, deleted, reactionRows, starRows, translated] = await Promise.all([
    db.directMessage.findMany({
      where: { id: { gt: after }, ...conversationWhere },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        attachments: { select: { id: true, originalName: true, mimeType: true, size: true }, orderBy: { id: "asc" } },
        replyTo: {
          select: { id: true, body: true, senderId: true, deletedAt: true, attachments: { select: { id: true }, take: 1 } },
        },
      },
    }),
    // The highest id among OUR messages that the partner has already read.
    db.directMessage.findFirst({
      where: { senderId: meId, recipientId: otherId, read: true },
      orderBy: { id: "desc" },
      select: { id: true },
    }),
    db.user.findUnique({ where: { id: otherId }, select: PRESENCE_SELECT }),
    // Messages deleted recently, so already-loaded bubbles can flip to tombstones live.
    db.directMessage.findMany({
      where: { deletedAt: { gte: recentlyDeletedSince }, ...conversationWhere },
      select: { id: true },
    }),
    // Reactions for the whole loaded window — cheap at this app's scale, and
    // simplest way to keep reaction chips on already-loaded messages in sync
    // (a reaction on an old message wouldn't otherwise be "newer than after").
    db.messageReaction.findMany({
      where: { message: conversationWhere },
      select: { messageId: true, userId: true, emoji: true },
    }),
    // Stars are private to the current user — only fetch mine, so this also
    // stays in sync if you star a message from another tab/device.
    db.messageStar.findMany({
      where: { userId: meId, message: conversationWhere },
      select: { messageId: true },
    }),
    // Translations that finished recently (translation now runs in the
    // background after send — see scheduleTranslation in lib/actions/messages.ts)
    // so an already-sent bubble can pick up its translation moments later,
    // the same way deletedIds patches an already-loaded bubble.
    db.directMessage.findMany({
      where: { translatedAt: { gte: recentlyTranslatedSince }, ...conversationWhere },
      select: { id: true, translatedBody: true, translatedLang: true, translationFailed: true },
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
        translatedBody: isDeleted ? null : m.translatedBody,
        translatedLang: isDeleted ? null : m.translatedLang,
        translationFailed: isDeleted ? false : m.translationFailed,
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
    // Full reaction snapshot for every message currently in the loaded window
    // (not just newly-fetched ones) — a reaction on an older message wouldn't
    // otherwise be "newer than after", so this is how it reaches the client.
    allReactions: Array.from(reactionsByMessage.entries()).map(([messageId, reactions]) => ({ messageId, reactions })),
    // Same idea for stars: the full set of my starred ids in the loaded
    // window, so starring from another tab/device is reflected here too.
    myStarredIds: Array.from(myStarredIds),
    translationUpdates: translated,
    lastReadMyId: lastRead?.id ?? 0,
    partnerPresence: partner ?? null,
    partnerTyping: isTyping(otherId, meId),
    deletedIds: deleted.map((d) => d.id),
  });
}
