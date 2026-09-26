import type { Attachment } from "@prisma/client";
import { db } from "@/lib/db";
import { canOpenStandalone, folderVisibleTo } from "@/lib/docAccess";

/**
 * May this signed-in person open this file? One place for the rules, used by
 * downloads, thumbnails and previews alike.
 */
export async function canUserOpen(a: Attachment, me: { id: number; role: string }): Promise<boolean> {
  // In the Documents bin: only its uploader or an admin (to preview before restoring).
  if (a.deletedAt) {
    if (me.role !== "ADMIN" && a.uploadedById !== me.id) return false;
    return true;
  }

  // Direct-message attachments are private to the two people in the thread.
  if (a.messageId) {
    const msg = await db.directMessage.findUnique({
      where: { id: a.messageId },
      select: { senderId: true, recipientId: true },
    });
    if (!msg || (msg.senderId !== me.id && msg.recipientId !== me.id)) {
      return false;
    }
  } else if (a.discussionMessageId) {
    // Discussion attachments belong to the company-wide board: any signed-in
    // user may view them.
  } else if (a.noteId) {
    // Note attachments are private to the note's owner and anyone it's shared with.
    const note = await db.note.findUnique({
      where: { id: a.noteId },
      select: { userId: true, shares: { select: { userId: true } } },
    });
    const allowed =
      note && (note.userId === me.id || note.shares.some((s) => s.userId === me.id));
    if (!allowed) return false;
  } else if (a.groupMessageId) {
    // Group-chat files are for that group's members.
    const msg = await db.groupMessage.findUnique({ where: { id: a.groupMessageId }, select: { groupId: true } });
    const member =
      msg && (await db.groupMember.findUnique({ where: { groupId_userId: { groupId: msg.groupId, userId: me.id } } }));
    if (!member) return false;
  } else if (!a.taskId) {
    // Unsent chat-box drafts: only their uploader.
    if (a.draft && a.uploadedById !== me.id) return false;
    // Documents files: their General access / who they're shared with.
    if (!a.draft) {
      const shared = !!(await db.attachmentShare.findUnique({
        where: { attachmentId_userId: { attachmentId: a.id, userId: me.id } },
      }));
      const inVisibleFolder = !!a.folderId && (await folderVisibleTo(a.folderId, me));
      if (!canOpenStandalone(a, me, shared, inVisibleFolder)) return false;
    }
  }

  return true;
}
