"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { deleteUpload } from "@/lib/storage";
import { pushNotification } from "@/lib/notify";
import { accessibleFolders, canManageSharing, folderVisibleTo } from "@/lib/docAccess";

/** Documents: folders, moving, renaming, stars, the bin and versions. */

type Ok = { ok: true } | { ok: false; error: string };
const fail = (error: string): Ok => ({ ok: false, error });
const done = (): Ok => {
  revalidatePath("/documents");
  return { ok: true };
};

const cleanName = (s: unknown, max = 120) =>
  String(s ?? "")
    .replace(/[\\/\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max);

// --- Folders -----------------------------------------------------------------

export async function createFolder(name: string, parentId: number | null): Promise<Ok & { id?: number }> {
  const user = await requireUser();
  const n = cleanName(name, 80);
  if (!n) return fail("Give the folder a name.");
  if (parentId !== null && !(await folderVisibleTo(parentId, user))) return fail("That folder isn't available.");
  const f = await db.docFolder.create({ data: { name: n, parentId, ownerId: user.id } });
  revalidatePath("/documents");
  return { ok: true, id: f.id };
}

async function manageFolder(id: number) {
  const user = await requireUser();
  const f = await db.docFolder.findUnique({ where: { id } });
  if (!f) return { user, f: null, error: "That folder isn't available." };
  if (user.role !== "ADMIN" && f.ownerId !== user.id) return { user, f: null, error: "Only the folder's owner (or an admin) can change it." };
  return { user, f, error: null };
}

export async function renameFolder(id: number, name: string): Promise<Ok> {
  const { f, error } = await manageFolder(id);
  if (!f) return fail(error!);
  const n = cleanName(name, 80);
  if (!n) return fail("Give the folder a name.");
  await db.docFolder.update({ where: { id }, data: { name: n } });
  return done();
}

/** Deletes a folder; what was inside moves up to its parent (nothing is lost). */
export async function deleteFolder(id: number): Promise<Ok> {
  const { f, error } = await manageFolder(id);
  if (!f) return fail(error!);
  await db.$transaction([
    db.attachment.updateMany({ where: { folderId: id }, data: { folderId: f.parentId } }),
    db.docFolder.updateMany({ where: { parentId: id }, data: { parentId: f.parentId } }),
    db.docFolder.delete({ where: { id } }),
  ]);
  return done();
}

/** Moves a folder under another (or to the top level) — never into itself. */
export async function moveFolder(id: number, parentId: number | null): Promise<Ok> {
  const { user, f, error } = await manageFolder(id);
  if (!f) return fail(error!);
  if (parentId !== null) {
    if (!(await folderVisibleTo(parentId, user))) return fail("That folder isn't available.");
    for (let cur: number | null = parentId, d = 0; cur !== null && d < 50; d++) {
      if (cur === id) return fail("A folder can't go inside itself.");
      cur = (await db.docFolder.findUnique({ where: { id: cur }, select: { parentId: true } }))?.parentId ?? null;
    }
  }
  await db.docFolder.update({ where: { id }, data: { parentId } });
  return done();
}

export type FolderShareInfo = {
  id: number;
  name: string;
  canManage: boolean;
  access: "RESTRICTED" | "COMPANY";
  owner: string;
  people: { id: number; name: string; jobTitle: string | null; avatarPath: string | null }[];
  directory: { id: number; name: string; jobTitle: string | null; avatarPath: string | null }[];
};

export async function getFolderShareInfo(id: number): Promise<{ ok: true; info: FolderShareInfo } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!(await folderVisibleTo(id, user))) return { ok: false, error: "That folder isn't available." };
  const f = await db.docFolder.findUnique({
    where: { id },
    include: { owner: { select: { name: true } }, shares: { include: { user: { select: { id: true, name: true, jobTitle: true, avatarPath: true } } } } },
  });
  if (!f) return { ok: false, error: "That folder isn't available." };
  const canManage = user.role === "ADMIN" || f.ownerId === user.id;
  const directory = canManage
    ? await db.user.findMany({
        where: { active: true, id: { not: f.ownerId } },
        select: { id: true, name: true, jobTitle: true, avatarPath: true },
        orderBy: { name: "asc" },
      })
    : [];
  return {
    ok: true,
    info: {
      id: f.id,
      name: f.name,
      canManage,
      access: f.access === "RESTRICTED" ? "RESTRICTED" : "COMPANY",
      owner: f.owner.name,
      people: f.shares.map((s) => s.user),
      directory,
    },
  };
}

export async function setFolderAccess(id: number, access: string): Promise<Ok> {
  const { f, error } = await manageFolder(id);
  if (!f) return fail(error!);
  if (access !== "RESTRICTED" && access !== "COMPANY") return fail("Unknown access level.");
  await db.docFolder.update({ where: { id }, data: { access } });
  return done();
}

export async function shareFolderWith(id: number, userIds: number[]): Promise<Ok> {
  const { user, f, error } = await manageFolder(id);
  if (!f) return fail(error!);
  const ids = Array.from(new Set(userIds.filter((n) => Number.isInteger(n) && n > 0 && n !== f.ownerId))).slice(0, 50);
  const existing = new Set((await db.docFolderShare.findMany({ where: { folderId: id } })).map((s) => s.userId));
  const fresh = (await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } })).filter((p) => !existing.has(p.id));
  if (fresh.length) {
    await db.docFolderShare.createMany({ data: fresh.map((p) => ({ folderId: id, userId: p.id })) });
    for (const p of fresh) await pushNotification(p.id, `📁 ${user.name} shared a folder with you: ${f.name}`, `/documents?folder=${id}`);
  }
  return done();
}

export async function unshareFolder(id: number, userId: number): Promise<Ok> {
  const { f, error } = await manageFolder(id);
  if (!f) return fail(error!);
  await db.docFolderShare.deleteMany({ where: { folderId: id, userId } });
  return done();
}

/** Every folder this person can see, for the "Move to…" picker. */
export async function folderChoices(): Promise<{ id: number; path: string }[]> {
  const user = await requireUser();
  const { all, visibleIds } = await accessibleFolders(user);
  const path = (id: number) => {
    const names: string[] = [];
    for (let cur = all.get(id), d = 0; cur && d < 50; d++) {
      names.unshift(cur.name);
      cur = cur.parentId !== null ? all.get(cur.parentId) : undefined;
    }
    return names.join(" / ");
  };
  return visibleIds.map((id) => ({ id, path: path(id) })).sort((a, b) => a.path.localeCompare(b.path));
}

// --- Files -------------------------------------------------------------------

/** Files this person may reorganise: their own uploads (admins: any). */
async function ownFiles(ids: number[]) {
  const user = await requireUser();
  const files = await db.attachment.findMany({
    where: { id: { in: ids.slice(0, 500) }, messageId: null, groupMessageId: null, noteId: null, draft: false },
  });
  return { user, files: files.filter((a) => canManageSharing(a, user)) };
}

export async function moveFiles(ids: number[], folderId: number | null): Promise<Ok & { moved?: number }> {
  const { user, files } = await ownFiles(ids);
  if (folderId !== null && !(await folderVisibleTo(folderId, user))) return fail("That folder isn't available.");
  if (!files.length) return fail("You can only move files you uploaded.");
  const moving = files.map((f) => f.id);
  await db.$transaction([
    db.attachment.updateMany({ where: { id: { in: moving } }, data: { folderId } }),
    // Moved into a folder: the folder now decides who sees it (a public link stays public).
    ...(folderId !== null ? [db.attachment.updateMany({ where: { id: { in: moving }, access: "COMPANY" }, data: { access: "RESTRICTED" } })] : []),
  ]);
  revalidatePath("/documents");
  return { ok: true, moved: files.length };
}

export async function renameFile(id: number, name: string): Promise<Ok> {
  const { files } = await ownFiles([id]);
  if (!files.length) return fail("Only the person who uploaded it (or an admin) can rename it.");
  const n = cleanName(name, 200);
  if (!n) return fail("Give the file a name.");
  await db.attachment.update({ where: { id }, data: { originalName: n } });
  return done();
}

/** ⭐ Star / unstar a file (just for you). */
export async function toggleFileStar(id: number): Promise<{ starred: boolean }> {
  const user = await requireUser();
  const key = { userId_attachmentId: { userId: user.id, attachmentId: id } };
  const had = await db.fileStar.findUnique({ where: key });
  if (had) await db.fileStar.delete({ where: key });
  else if (await db.attachment.findUnique({ where: { id }, select: { id: true } })) await db.fileStar.create({ data: { userId: user.id, attachmentId: id } });
  revalidatePath("/documents");
  return { starred: !had };
}

// --- Bin ---------------------------------------------------------------------

async function binFiles(ids: number[]) {
  const user = await requireUser();
  const where = { id: { in: ids.slice(0, 500) }, deletedAt: { not: null }, ...(user.role === "ADMIN" ? {} : { uploadedById: user.id }) };
  return { user, files: await db.attachment.findMany({ where }) };
}

export async function restoreFiles(ids: number[]): Promise<Ok> {
  const { files } = await binFiles(ids);
  await db.attachment.updateMany({ where: { id: { in: files.map((f) => f.id) } }, data: { deletedAt: null, deletedById: null } });
  return done();
}

/** Deletes files in the bin for good (and their earlier versions). */
export async function purgeFiles(ids: number[]): Promise<Ok> {
  const { files } = await binFiles(ids);
  const versions = await db.attachmentVersion.findMany({ where: { attachmentId: { in: files.map((f) => f.id) } } });
  await db.attachment.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
  for (const f of files) await deleteUpload(f.storedName);
  for (const v of versions) await deleteUpload(v.storedName);
  return done();
}

export async function emptyBin(): Promise<Ok> {
  const user = await requireUser();
  const mine = await db.attachment.findMany({
    where: { deletedAt: { not: null }, ...(user.role === "ADMIN" ? {} : { uploadedById: user.id }) },
    select: { id: true },
  });
  return purgeFiles(mine.map((m) => m.id));
}

// --- Versions ----------------------------------------------------------------

export async function listVersions(id: number) {
  const user = await requireUser();
  const a = await db.attachment.findUnique({ where: { id }, include: { uploadedBy: { select: { name: true } } } });
  if (!a) return { ok: false as const, error: "That file isn't available." };
  const versions = await db.attachmentVersion.findMany({
    where: { attachmentId: id },
    include: { uploadedBy: { select: { name: true } } },
    orderBy: { replacedAt: "desc" },
  });
  return {
    ok: true as const,
    canManage: canManageSharing(a, user),
    current: { name: a.originalName, size: a.size, at: a.createdAt.toISOString(), by: a.uploadedBy?.name ?? "—" },
    versions: versions.map((v) => ({ id: v.id, name: v.originalName, size: v.size, at: v.createdAt.toISOString(), by: v.uploadedBy?.name ?? "—" })),
  };
}

/** Makes an earlier version current again (the current one becomes a version). */
export async function restoreVersion(id: number, versionId: number): Promise<Ok> {
  const { user, files } = await ownFiles([id]);
  const a = files[0];
  if (!a) return fail("Only the person who uploaded it (or an admin) can do that.");
  const v = await db.attachmentVersion.findFirst({ where: { id: versionId, attachmentId: id } });
  if (!v) return fail("That version isn't available.");
  await db.$transaction([
    db.attachmentVersion.create({
      data: { attachmentId: id, storedName: a.storedName, originalName: a.originalName, mimeType: a.mimeType, size: a.size, uploadedById: a.uploadedById ?? user.id, createdAt: a.createdAt },
    }),
    db.attachment.update({
      where: { id },
      data: { storedName: v.storedName, originalName: v.originalName, mimeType: v.mimeType, size: v.size, createdAt: v.createdAt },
    }),
    db.attachmentVersion.delete({ where: { id: versionId } }),
  ]);
  return done();
}

/** Admin: switch off every public link at once (files go back to "Looms & Berries"). */
export async function turnOffAllPublicLinks(): Promise<{ ok: boolean; files: number; bundles: number }> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { ok: false, files: 0, bundles: 0 };
  const [files, bundles] = await db.$transaction([
    db.attachment.updateMany({ where: { access: "PUBLIC" }, data: { access: "COMPANY" } }),
    db.fileBundle.updateMany({ where: { disabled: false }, data: { disabled: true } }),
  ]);
  revalidatePath("/documents");
  return { ok: true, files: files.count, bundles: bundles.count };
}

/** Moves files to the bin (their uploader or an admin). Returns how many. */
export async function binFileIds(ids: number[]): Promise<{ ok: true; binned: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const files = await db.attachment.findMany({
    where: { id: { in: ids.slice(0, 500) }, deletedAt: null, messageId: null, groupMessageId: null, noteId: null, draft: false },
  });
  const mine = files.filter((a) => a.uploadedById === user.id || user.role === "ADMIN");
  if (!mine.length) return { ok: false, error: "You can only delete files you uploaded." };
  await db.attachment.updateMany({ where: { id: { in: mine.map((a) => a.id) } }, data: { deletedAt: new Date(), deletedById: user.id } });
  revalidatePath("/documents");
  return { ok: true, binned: mine.length };
}
