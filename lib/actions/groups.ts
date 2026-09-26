"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pushNotification } from "@/lib/notify";
import { deleteUpload } from "@/lib/storage";
import { findMentionedIds } from "@/lib/mentions";

async function requireMember(groupId: number, userId: number) {
  const member = await db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
  return !!member;
}

export type CreatedGroup = { id: number };

/**
 * Creates a group (any employee can — WhatsApp-style) with the given name
 * and member ids. The creator is always added even if not in `memberIds`,
 * so you can never make a group you're not yourself a part of.
 */
export async function createGroup(name: string, memberIds: number[]): Promise<CreatedGroup | { error: string }> {
  const user = await requireUser();
  const cleanName = String(name ?? "").trim().slice(0, 100);
  if (!cleanName) return { error: "Give the group a name." };

  const ids = Array.from(new Set([...(memberIds ?? []).filter((n) => Number.isFinite(n) && n > 0), user.id]));
  const validUsers = await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } });
  if (validUsers.length < 2) return { error: "Pick at least one other person." };

  const group = await db.group.create({
    data: {
      name: cleanName,
      createdById: user.id,
      members: { create: validUsers.map((u) => ({ userId: u.id })) },
    },
  });

  for (const u of validUsers) {
    if (u.id === user.id) continue;
    await pushNotification(u.id, `${user.name} added you to "${cleanName}"`, `/discussion/${group.id}`);
  }

  revalidatePath("/discussion");
  return { id: group.id };
}

/** Adds people to an existing group. Any current member can add more, same as WhatsApp. */
export async function addGroupMembers(groupId: number, memberIds: number[]): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!(await requireMember(groupId, user.id))) return { ok: false, error: "Not a member of this group." };

  const group = await db.group.findUnique({ where: { id: groupId }, select: { name: true } });
  if (!group) return { ok: false, error: "Group not found." };

  const ids = (memberIds ?? []).filter((n) => Number.isFinite(n) && n > 0);
  const validUsers = await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, name: true } });
  const already = await db.groupMember.findMany({ where: { groupId, userId: { in: validUsers.map((u) => u.id) } }, select: { userId: true } });
  const alreadyIn = new Set(already.map((m) => m.userId));
  const toAdd = validUsers.filter((u) => !alreadyIn.has(u.id));
  if (!toAdd.length) return { ok: true };

  await db.groupMember.createMany({ data: toAdd.map((u) => ({ groupId, userId: u.id })) });
  for (const u of toAdd) {
    await pushNotification(u.id, `${user.name} added you to "${group.name}"`, `/discussion/${groupId}`);
  }

  revalidatePath(`/discussion/${groupId}`);
  revalidatePath("/discussion");
  return { ok: true };
}

/** Leaving removes your own membership — the group and its history stay intact for everyone else. */
export async function leaveGroup(groupId: number): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await db.groupMember.deleteMany({ where: { groupId, userId: user.id } });
  revalidatePath("/discussion");
  return { ok: true };
}

export type GroupMessageAttachment = { id: number; name: string; mimeType: string; size: number };
export type GroupReplyPreview = { id: number; body: string; senderId: number; hasAttachment: boolean };

export type SentGroupMessage = {
  id: number;
  body: string;
  senderId: number;
  groupId: number;
  createdAt: string;
  attachments: GroupMessageAttachment[];
  replyTo: GroupReplyPreview | null;
};

/**
 * Sends a group message (optionally with attachments and/or a reply quote)
 * and returns it so the client can reconcile its optimistic bubble. Mirrors
 * sendMessage in lib/actions/messages.ts for 1:1 chat.
 */
export async function sendGroupMessage(
  groupId: number,
  rawBody: string,
  attachmentIds: number[] = [],
  replyToId?: number | null
): Promise<SentGroupMessage | { error: string }> {
  const user = await requireUser();
  const body = String(rawBody ?? "").trim();
  const ids = (attachmentIds ?? []).filter((n) => Number.isFinite(n) && n > 0).slice(0, 10);

  if (!(await requireMember(groupId, user.id))) return { error: "not a member" };
  if (!body && ids.length === 0) return { error: "empty" };
  if (body.length > 4000) return { error: "too long" };

  let replyToRow: (GroupReplyPreview & { deletedAt: Date | null }) | null = null;
  if (replyToId) {
    const parent = await db.groupMessage.findUnique({
      where: { id: replyToId },
      select: { id: true, body: true, senderId: true, groupId: true, deletedAt: true, attachments: { select: { id: true }, take: 1 } },
    });
    if (parent && !parent.deletedAt && parent.groupId === groupId) {
      replyToRow = {
        id: parent.id,
        body: parent.body,
        senderId: parent.senderId,
        hasAttachment: parent.attachments.length > 0,
        deletedAt: null,
      };
    }
  }

  const msg = await db.groupMessage.create({
    data: { body, senderId: user.id, groupId, replyToId: replyToRow?.id ?? null },
  });

  if (ids.length > 0) {
    await db.attachment.updateMany({
      where: { id: { in: ids }, uploadedById: user.id, messageId: null, taskId: null, discussionMessageId: null, groupMessageId: null },
      data: { groupMessageId: msg.id, draft: false },
    });
  }
  const attachments = await db.attachment.findMany({
    where: { groupMessageId: msg.id },
    select: { id: true, originalName: true, mimeType: true, size: true },
    orderBy: { id: "asc" },
  });

  // Ping @mentioned members, and separately nudge everyone else in the group
  // who isn't mentioned — same "New message" style ping a 1:1 chat sends,
  // just fanned out to the whole membership instead of a single recipient.
  const members = await db.groupMember.findMany({ where: { groupId, userId: { not: user.id } }, select: { userId: true } });
  const directory = await db.user.findMany({ where: { id: { in: members.map((m) => m.userId) } }, select: { id: true, name: true } });
  const mentioned = new Set(body ? findMentionedIds(body, directory) : []);
  const group = await db.group.findUnique({ where: { id: groupId }, select: { name: true } });
  for (const m of members) {
    const label = mentioned.has(m.userId)
      ? `${user.name} mentioned you in "${group?.name}"`
      : `${user.name} sent a message in "${group?.name}"`;
    await pushNotification(m.userId, label, `/discussion/${groupId}`);
  }

  revalidatePath("/discussion");

  return {
    id: msg.id,
    body: msg.body,
    senderId: msg.senderId,
    groupId: msg.groupId,
    createdAt: msg.createdAt.toISOString(),
    attachments: attachments.map((a) => ({ id: a.id, name: a.originalName, mimeType: a.mimeType, size: a.size })),
    replyTo: replyToRow
      ? { id: replyToRow.id, body: replyToRow.body, senderId: replyToRow.senderId, hasAttachment: replyToRow.hasAttachment }
      : null,
  };
}

/** Deletes your own group message for everyone (tombstoned, like DM/Discussion delete). */
export async function deleteGroupMessage(messageId: number): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const msg = await db.groupMessage.findUnique({ where: { id: messageId }, include: { attachments: true } });
  if (!msg || msg.senderId !== user.id || msg.deletedAt) return { ok: false };

  await Promise.all(msg.attachments.map((a) => deleteUpload(a.storedName)));
  await db.attachment.deleteMany({ where: { groupMessageId: messageId } });
  await db.groupMessage.update({ where: { id: messageId }, data: { body: "", deletedAt: new Date() } });

  revalidatePath(`/discussion/${msg.groupId}`);
  return { ok: true };
}

export type GroupReactionSummary = { emoji: string; count: number; mine: boolean };

export async function toggleGroupReaction(
  messageId: number,
  emoji: string
): Promise<{ reactions: GroupReactionSummary[] } | { error: string }> {
  const user = await requireUser();
  const cleanEmoji = String(emoji ?? "").trim().slice(0, 8);
  if (!cleanEmoji) return { error: "invalid emoji" };

  const msg = await db.groupMessage.findUnique({ where: { id: messageId }, select: { groupId: true, deletedAt: true } });
  if (!msg || msg.deletedAt) return { error: "not found" };
  if (!(await requireMember(msg.groupId, user.id))) return { error: "forbidden" };

  const existing = await db.groupMessageReaction.findUnique({ where: { messageId_userId: { messageId, userId: user.id } } });
  if (existing && existing.emoji === cleanEmoji) {
    await db.groupMessageReaction.delete({ where: { id: existing.id } });
  } else {
    await db.groupMessageReaction.upsert({
      where: { messageId_userId: { messageId, userId: user.id } },
      create: { messageId, userId: user.id, emoji: cleanEmoji },
      update: { emoji: cleanEmoji },
    });
  }

  const rows = await db.groupMessageReaction.findMany({ where: { messageId } });
  const byEmoji = new Map<string, GroupReactionSummary>();
  for (const r of rows) {
    const cur = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    cur.count += 1;
    if (r.userId === user.id) cur.mine = true;
    byEmoji.set(r.emoji, cur);
  }

  revalidatePath(`/discussion/${msg.groupId}`);
  return { reactions: Array.from(byEmoji.values()) };
}

export async function toggleGroupStar(messageId: number): Promise<{ starred: boolean } | { error: string }> {
  const user = await requireUser();
  const msg = await db.groupMessage.findUnique({ where: { id: messageId }, select: { groupId: true, deletedAt: true } });
  if (!msg || msg.deletedAt) return { error: "not found" };
  if (!(await requireMember(msg.groupId, user.id))) return { error: "forbidden" };

  const existing = await db.groupMessageStar.findUnique({ where: { messageId_userId: { messageId, userId: user.id } } });
  if (existing) {
    await db.groupMessageStar.delete({ where: { id: existing.id } });
    return { starred: false };
  }
  await db.groupMessageStar.create({ data: { messageId, userId: user.id } });
  return { starred: true };
}

/** Marks a group read up to now — clears its unread badge in the group list. */
export async function markGroupRead(groupId: number): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await db.groupMember.updateMany({ where: { groupId, userId: user.id }, data: { lastReadAt: new Date() } });
  revalidatePath("/discussion");
  return { ok: true };
}
