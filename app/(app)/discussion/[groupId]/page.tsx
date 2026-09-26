import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import GroupChatThread from "@/components/GroupChatThread";

export const dynamic = "force-dynamic";

export default async function GroupPage(props: { params: Promise<{ groupId: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  const groupId = Number(params.groupId);
  if (!groupId) notFound();

  const membership = await db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: user.id } } });
  if (!membership) notFound();

  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group) notFound();

  // Viewing the thread now — clear this group's unread badge.
  await db.groupMember.update({ where: { groupId_userId: { groupId, userId: user.id } }, data: { lastReadAt: new Date() } });

  const [members, messages, reactionRows, starRows, allUsers] = await Promise.all([
    db.groupMember.findMany({
      where: { groupId },
      select: { user: { select: { id: true, name: true, jobTitle: true, avatarPath: true } } },
    }),
    db.groupMessage.findMany({
      where: { groupId },
      orderBy: { createdAt: "asc" },
      take: 500,
      include: {
        attachments: { select: { id: true, originalName: true, mimeType: true, size: true }, orderBy: { id: "asc" } },
        replyTo: {
          select: { id: true, body: true, senderId: true, deletedAt: true, attachments: { select: { id: true }, take: 1 } },
        },
      },
    }),
    db.groupMessageReaction.findMany({ where: { message: { groupId } }, select: { messageId: true, userId: true, emoji: true } }),
    db.groupMessageStar.findMany({ where: { userId: user.id, message: { groupId } }, select: { messageId: true } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, jobTitle: true, avatarPath: true } }),
  ]);
  const myStarredIds = new Set(starRows.map((s) => s.messageId));

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

  const initialMessages = messages.map((m) => {
    const isDeleted = !!m.deletedAt;
    return {
      id: m.id,
      body: isDeleted ? "" : m.body,
      senderId: m.senderId,
      createdAt: m.createdAt.toISOString(),
      deleted: isDeleted,
      attachments: isDeleted ? [] : m.attachments.map((a) => ({ id: a.id, name: a.originalName, mimeType: a.mimeType, size: a.size })),
      replyTo:
        m.replyTo && !m.replyTo.deletedAt
          ? { id: m.replyTo.id, body: m.replyTo.body, senderId: m.replyTo.senderId, hasAttachment: m.replyTo.attachments.length > 0 }
          : null,
      reactions: reactionsByMessage.get(m.id) ?? [],
      starred: myStarredIds.has(m.id),
      forwarded: m.forwarded,
    };
  });

  return (
    <GroupChatThread
      key={group.id}
      meId={user.id}
      group={{ id: group.id, name: group.name }}
      initialMembers={members.map((m) => m.user)}
      initialMessages={initialMessages}
      allUsers={allUsers}
    />
  );
}
