import type { Prisma } from "@prisma/client";

/**
 * Who can see which file in Documents — Google Drive style.
 *
 * Files that belong to a task follow the task (everyone signed in can see
 * tasks). A file uploaded straight to Documents ("standalone") follows its
 * General access: RESTRICTED (its uploader, admins and the people it's shared
 * with), COMPANY (everyone signed in) or PUBLIC (everyone signed in, plus
 * anyone with the public link). Chat, group and note files never show here.
 */
export const ACCESS_LEVELS = ["RESTRICTED", "COMPANY", "PUBLIC"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

type FileRow = {
  uploadedById: number | null;
  clientContactId?: number | null;
  taskId: number | null;
  messageId: number | null;
  groupMessageId: number | null;
  noteId: number | null;
  discussionMessageId: number | null;
  access: string;
};

export function isStandalone(a: FileRow) {
  return !a.taskId && !a.messageId && !a.groupMessageId && !a.noteId && !a.discussionMessageId;
}

/** The Documents list for one person. */
export function visibleDocsWhere(user: { id: number; role: string }): Prisma.AttachmentWhereInput {
  const base: Prisma.AttachmentWhereInput = { messageId: null, groupMessageId: null, noteId: null, draft: false };
  if (user.role === "ADMIN") return base;
  return {
    ...base,
    OR: [
      { taskId: { not: null } },
      { discussionMessageId: { not: null } },
      { uploadedById: user.id },
      { access: { in: ["COMPANY", "PUBLIC"] } },
      { shares: { some: { userId: user.id } } },
    ],
  };
}

/** May this person open a standalone Documents file? */
export function canOpenStandalone(a: FileRow, user: { id: number; role: string }, sharedWithMe: boolean) {
  return user.role === "ADMIN" || a.uploadedById === user.id || a.access === "COMPANY" || a.access === "PUBLIC" || sharedWithMe;
}

/** May this person change who a file is shared with (like a Drive owner)? */
export function canManageSharing(a: FileRow, user: { id: number; role: string }) {
  if (user.role === "ADMIN" || a.uploadedById === user.id) return true;
  // A client's upload has no staff owner — managers look after it.
  return !!a.clientContactId && user.role === "MANAGER";
}

/** A public link that isn't expired. */
export function publicLinkLive(a: { access: string; shareToken: string | null; shareExpiresAt: Date | null }, now = new Date()) {
  return a.access === "PUBLIC" && !!a.shareToken && (!a.shareExpiresAt || a.shareExpiresAt > now);
}
