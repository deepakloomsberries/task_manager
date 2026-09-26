"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { accessibleFolders, visibleDocsWhere } from "@/lib/docAccess";
import { newToken } from "@/lib/publicAccess";

/**
 * Several Documents files behind one public link: a download page listing
 * them, each downloadable, plus "Download all" as a zip. Only files the
 * creator can open themselves can go in.
 */
export async function createBundle(
  ids: number[],
  title: string,
  expiryDays: number,
  password: string
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const { visibleIds } = await accessibleFolders(user);
  const files = await db.attachment.findMany({
    where: { AND: [visibleDocsWhere(user, visibleIds), { id: { in: ids.slice(0, 100) } }] },
    select: { id: true, originalName: true },
  });
  if (!files.length) return { ok: false, error: "Pick at least one file." };
  const days = Math.max(0, Math.min(365, Math.floor(expiryDays) || 0));
  const pw = password.trim();
  if (pw && pw.length < 4) return { ok: false, error: "Use a password of at least 4 characters." };
  const token = newToken();
  await db.fileBundle.create({
    data: {
      token,
      title: title.trim().slice(0, 120) || (files.length === 1 ? files[0].originalName : `${files.length} files`),
      createdById: user.id,
      expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
      passwordHash: pw ? await bcrypt.hash(pw, 10) : null,
      items: { create: files.map((f) => ({ attachmentId: f.id })) },
    },
  });
  revalidatePath("/documents");
  return { ok: true, token };
}

/** Switches a bundle link off (or back on). Its creator or an admin. */
export async function setBundleDisabled(id: number, disabled: boolean): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const b = await db.fileBundle.findUnique({ where: { id } });
  if (!b || (b.createdById !== user.id && user.role !== "ADMIN")) return { ok: false };
  await db.fileBundle.update({ where: { id }, data: { disabled } });
  revalidatePath("/documents");
  return { ok: true };
}
