import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

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

/** Everything that's in Documents at all (not chat/note files, drafts or the bin). */
export const DOCS_BASE: Prisma.AttachmentWhereInput = { messageId: null, groupMessageId: null, noteId: null, draft: false, deletedAt: null };

/**
 * The Documents list for one person. `folderIds` = folders they can see
 * (from accessibleFolders) — a file inside one inherits its access.
 */
export function visibleDocsWhere(user: { id: number; role: string }, folderIds: number[] = []): Prisma.AttachmentWhereInput {
  if (user.role === "ADMIN") return DOCS_BASE;
  return {
    ...DOCS_BASE,
    OR: [
      { taskId: { not: null } },
      { discussionMessageId: { not: null } },
      { uploadedById: user.id },
      { access: { in: ["COMPANY", "PUBLIC"] } },
      { shares: { some: { userId: user.id } } },
      ...(folderIds.length ? [{ folderId: { in: folderIds } }] : []),
    ],
  };
}

export type FolderNode = { id: number; name: string; parentId: number | null; ownerId: number; access: string; shareIds: number[] };

/**
 * Every folder with who can see and manage it. Access is inherited: a folder
 * is visible if it — or any folder above it — is yours, shared with you or
 * open to everyone. Folders are few, so this loads them all at once.
 */
export async function accessibleFolders(user: { id: number; role: string }) {
  const rows = await db.docFolder.findMany({
    select: { id: true, name: true, parentId: true, ownerId: true, access: true, shares: { select: { userId: true } } },
    orderBy: { name: "asc" },
  });
  const all = new Map<number, FolderNode>(rows.map((r) => [r.id, { ...r, shareIds: r.shares.map((x) => x.userId) }]));
  const memo = new Map<number, boolean>();
  const direct = (f: FolderNode) => user.role === "ADMIN" || f.ownerId === user.id || f.access === "COMPANY" || f.shareIds.includes(user.id);
  const visible = (id: number, depth = 0): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    const f = all.get(id);
    const v = !!f && depth < 50 && (direct(f) || (f.parentId !== null && visible(f.parentId, depth + 1)));
    memo.set(id, v);
    return v;
  };
  const visibleIds = rows.filter((r) => visible(r.id)).map((r) => r.id);
  return { all, visibleIds, canSee: (id: number) => visible(id) };
}

/** Breadcrumb from the top level down to this folder. */
export function folderPath(all: Map<number, FolderNode>, id: number | null): FolderNode[] {
  const out: FolderNode[] = [];
  let cur = id !== null ? all.get(id) : undefined;
  while (cur && out.length < 50) {
    out.unshift(cur);
    cur = cur.parentId !== null ? all.get(cur.parentId) : undefined;
  }
  return out;
}

/** Can this person see a folder? (Walks up the tree — for single checks.) */
export async function folderVisibleTo(folderId: number | null, user: { id: number; role: string }): Promise<boolean> {
  let id = folderId;
  for (let depth = 0; id !== null && depth < 50; depth++) {
    const f = await db.docFolder.findUnique({ where: { id }, select: { parentId: true, ownerId: true, access: true, shares: { where: { userId: user.id } } } });
    if (!f) return false;
    if (user.role === "ADMIN" || f.ownerId === user.id || f.access === "COMPANY" || f.shares.length) return true;
    id = f.parentId;
  }
  return false;
}

/** May this person open a standalone Documents file? (folderVisible: its folder is visible to them) */
export function canOpenStandalone(a: FileRow, user: { id: number; role: string }, sharedWithMe: boolean, folderVisible = false) {
  return user.role === "ADMIN" || a.uploadedById === user.id || a.access === "COMPANY" || a.access === "PUBLIC" || sharedWithMe || folderVisible;
}

/** May this person change who a file is shared with (like a Drive owner)? */
export function canManageSharing(a: FileRow, user: { id: number; role: string }) {
  if (user.role === "ADMIN" || a.uploadedById === user.id) return true;
  // A client's upload has no staff owner — managers look after it.
  return !!a.clientContactId && user.role === "MANAGER";
}

/** A public link that isn't expired (and a file that isn't in the bin). */
export function publicLinkLive(
  a: { access: string; shareToken: string | null; shareExpiresAt: Date | null; deletedAt?: Date | null },
  now = new Date()
) {
  return a.access === "PUBLIC" && !!a.shareToken && !a.deletedAt && (!a.shareExpiresAt || a.shareExpiresAt > now);
}
