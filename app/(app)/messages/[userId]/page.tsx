import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import ChatThread from "@/components/ChatThread";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: { userId: string } }) {
  const user = await requireUser();
  const otherId = Number(params.userId);
  if (!otherId || otherId === user.id) notFound();

  const other = await db.user.findUnique({ where: { id: otherId } });
  if (!other) notFound();

  // Mark the messages this person sent us as read now that we're viewing them.
  await db.directMessage.updateMany({
    where: { senderId: otherId, recipientId: user.id, read: false },
    data: { read: true },
  });

  const [messages, lastRead, reactionRows] = await Promise.all([
    db.directMessage.findMany({
      where: {
        OR: [
          { senderId: user.id, recipientId: otherId },
          { senderId: otherId, recipientId: user.id },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 500,
      include: {
        attachments: { select: { id: true, originalName: true, mimeType: true, size: true }, orderBy: { id: "asc" } },
        replyTo: {
          select: { id: true, body: true, senderId: true, deletedAt: true, attachments: { select: { id: true }, take: 1 } },
        },
      },
    }),
    db.directMessage.findFirst({
      where: { senderId: user.id, recipientId: otherId, read: true },
      orderBy: { id: "desc" },
      select: { id: true },
    }),
    db.messageReaction.findMany({
      where: {
        message: {
          OR: [
            { senderId: user.id, recipientId: otherId },
            { senderId: otherId, recipientId: user.id },
          ],
        },
      },
      select: { messageId: true, userId: true, emoji: true },
    }),
  ]);

  const reactionsByMessage = new Map<number, { emoji: string; count: number; mine: boolean }[]>();
  for (const r of reactionRows) {
    const list = reactionsByMessage.get(r.messageId) ?? [];
    const existing = list.find((x) => x.emoji === r.emoji);
    if (existing) {
      existing.count += 1;
      if (r.userId === user.id) existing.mine = true;
    } else {
      list.push({ emoji: r.emoji, count: 1, mine: r.userId === user.id });
    }
    reactionsByMessage.set(r.messageId, list);
  }

  return (
    <ChatThread
      // Force a full remount when switching between conversations — without
      // it, React reuses this component instance across navigations (same
      // position in the tree), so message/composer/panel state from the
      // previous chat would leak into the next one, and the mount effect
      // below (scroll-to-bottom, unread-badge refresh) would only ever fire
      // once instead of on every chat switch.
      key={other.id}
      meId={user.id}
      other={{
        id: other.id,
        name: other.name,
        jobTitle: other.jobTitle,
        email: other.email,
        avatarPath: other.avatarPath,
      }}
      initialMessages={messages.map((m) => ({
        id: m.id,
        body: m.deletedAt ? "" : m.body,
        senderId: m.senderId,
        createdAt: m.createdAt.toISOString(),
        deleted: !!m.deletedAt,
        attachments: m.deletedAt
          ? []
          : m.attachments.map((a) => ({
              id: a.id,
              name: a.originalName,
              mimeType: a.mimeType,
              size: a.size,
            })),
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
      }))}
      initialLastReadMyId={lastRead?.id ?? 0}
      initialPartnerLastSeenAt={other.lastSeenAt ? other.lastSeenAt.toISOString() : null}
    />
  );
}
