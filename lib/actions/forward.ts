"use server";

import path from "path";
import fs from "fs/promises";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/storage";
import { sendMessage } from "@/lib/actions/messages";
import { sendGroupMessage } from "@/lib/actions/groups";

/** Most chats a message can be forwarded to in one go. */
const MAX_FORWARD_TARGETS = 20;

export type ForwardTargets = {
  people: { id: number; name: string; jobTitle: string | null; avatarPath: string | null }[];
  groups: { id: number; name: string; members: number }[];
};

/** Where you can forward to: every active colleague and the groups you're in. */
export async function forwardTargets(): Promise<ForwardTargets> {
  const user = await requireUser();
  const [people, groups] = await Promise.all([
    db.user.findMany({
      where: { active: true, id: { not: user.id } },
      select: { id: true, name: true, jobTitle: true, avatarPath: true },
      orderBy: { name: "asc" },
    }),
    db.group.findMany({
      where: { members: { some: { userId: user.id } } },
      select: { id: true, name: true, _count: { select: { members: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return { people, groups: groups.map((g) => ({ id: g.id, name: g.name, members: g._count.members })) };
}

type Source = {
  body: string;
  attachments: { storedName: string | null; originalName: string; mimeType: string; size: number; externalUrl: string | null }[];
};

/** The message, if you're allowed to see it (you're in that chat) and it isn't deleted. */
async function loadSource(kind: "dm" | "group", messageId: number, userId: number): Promise<Source | null> {
  const attachments = { select: { storedName: true, originalName: true, mimeType: true, size: true, externalUrl: true } };
  if (kind === "dm") {
    const m = await db.directMessage.findUnique({ where: { id: messageId }, include: { attachments } });
    if (!m || m.deletedAt || (m.senderId !== userId && m.recipientId !== userId)) return null;
    return m;
  }
  const m = await db.groupMessage.findUnique({ where: { id: messageId }, include: { attachments } });
  if (!m || m.deletedAt) return null;
  const member = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: m.groupId, userId } } });
  return member ? m : null;
}

/**
 * Fresh copies of the message's files, owned by the forwarder and not yet
 * attached to anything — exactly what sendMessage/sendGroupMessage expect.
 * Each target gets its own copy, so deleting one chat's message never
 * removes the file from another.
 */
async function copyAttachments(src: Source, userId: number): Promise<number[]> {
  const ids: number[] = [];
  for (const a of src.attachments) {
    let storedName: string | null = null;
    if (a.storedName) {
      storedName = crypto.randomUUID() + path.extname(a.storedName);
      try {
        await fs.copyFile(path.join(UPLOAD_DIR, a.storedName), path.join(UPLOAD_DIR, storedName));
      } catch {
        continue; // the original file is gone from disk — forward the rest
      }
    }
    const row = await db.attachment.create({
      data: {
        storedName,
        originalName: a.originalName,
        mimeType: a.mimeType,
        size: a.size,
        externalUrl: a.externalUrl,
        uploadedById: userId,
      },
    });
    ids.push(row.id);
  }
  return ids;
}

/**
 * Forwards one message (text + files) to several people and/or groups. Each
 * copy is marked "Forwarded"; the original sender isn't named, like WhatsApp.
 */
export async function forwardMessage(
  kind: "dm" | "group",
  messageId: number,
  userIds: number[],
  groupIds: number[]
): Promise<{ ok: true; sent: number; failed: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const people = Array.from(new Set(userIds.filter((n) => Number.isInteger(n) && n > 0 && n !== user.id)));
  const groups = Array.from(new Set(groupIds.filter((n) => Number.isInteger(n) && n > 0)));
  if (people.length + groups.length === 0) return { ok: false, error: "Pick at least one chat." };
  if (people.length + groups.length > MAX_FORWARD_TARGETS) {
    return { ok: false, error: `You can forward to at most ${MAX_FORWARD_TARGETS} chats at once.` };
  }

  const src = await loadSource(kind, messageId, user.id);
  if (!src) return { ok: false, error: "That message is no longer available." };
  if (!src.body && src.attachments.length === 0) return { ok: false, error: "Nothing to forward." };

  let sent = 0;
  let failed = 0;
  const targets: (["dm" | "group", number])[] = [...people.map((id) => ["dm", id] as ["dm", number]), ...groups.map((id) => ["group", id] as ["group", number])];
  for (const [to, id] of targets) {
    const files = await copyAttachments(src, user.id);
    const res = to === "dm" ? await sendMessage(id, src.body, files) : await sendGroupMessage(id, src.body, files);
    if ("error" in res) {
      failed++;
      // Tidy up copies that never got attached.
      const orphans = await db.attachment.findMany({ where: { id: { in: files }, messageId: null, groupMessageId: null } });
      await db.attachment.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
      for (const o of orphans) if (o.storedName) await fs.unlink(path.join(UPLOAD_DIR, o.storedName)).catch(() => {});
      continue;
    }
    if (to === "dm") await db.directMessage.update({ where: { id: res.id }, data: { forwarded: true } });
    else await db.groupMessage.update({ where: { id: res.id }, data: { forwarded: true } });
    sent++;
  }
  return { ok: true, sent, failed };
}
