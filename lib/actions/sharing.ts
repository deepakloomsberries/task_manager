"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pushNotification } from "@/lib/notify";
import { ACCESS_LEVELS, canManageSharing, canOpenStandalone, isStandalone, publicLinkLive, type AccessLevel } from "@/lib/docAccess";

/** Google-Drive-style sharing for Documents files. */

export type ShareInfo = {
  id: number;
  name: string;
  standalone: boolean;
  canManage: boolean;
  access: AccessLevel;
  token: string | null;
  linkLive: boolean;
  expiresAt: string | null;
  downloads: number;
  owner: string;
  people: { id: number; name: string; jobTitle: string | null; avatarPath: string | null }[];
  directory: { id: number; name: string; jobTitle: string | null; avatarPath: string | null }[];
};

type Result = { ok: true; info: ShareInfo } | { ok: false; error: string };

async function load(id: number) {
  return db.attachment.findUnique({
    where: { id },
    include: {
      uploadedBy: { select: { name: true } },
      clientContact: { select: { name: true } },
      shares: { include: { user: { select: { id: true, name: true, jobTitle: true, avatarPath: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
}

async function info(id: number, user: { id: number; role: string }): Promise<Result> {
  const a = await load(id);
  if (!a || a.messageId || a.groupMessageId || a.noteId || a.draft) return { ok: false, error: "That file isn't available." };
  const standalone = isStandalone(a);
  if (standalone && !canOpenStandalone(a, user, a.shares.some((s) => s.userId === user.id))) {
    return { ok: false, error: "That file isn't available." };
  }
  const canManage = canManageSharing(a, user);
  const directory = canManage && standalone
    ? await db.user.findMany({
        where: { active: true, id: { notIn: [user.id, ...(a.uploadedById ? [a.uploadedById] : [])] } },
        select: { id: true, name: true, jobTitle: true, avatarPath: true },
        orderBy: { name: "asc" },
      })
    : [];
  return {
    ok: true,
    info: {
      id: a.id,
      name: a.originalName,
      standalone,
      canManage,
      access: (ACCESS_LEVELS as readonly string[]).includes(a.access) ? (a.access as AccessLevel) : "COMPANY",
      token: canManage ? a.shareToken : publicLinkLive(a) ? a.shareToken : null,
      linkLive: publicLinkLive(a),
      expiresAt: a.shareExpiresAt?.toISOString() ?? null,
      downloads: a.downloads,
      owner: a.uploadedBy?.name ?? `${a.clientContact?.name ?? "Client"} (client)`,
      people: a.shares.map((s) => s.user),
      directory,
    },
  };
}

/** Everything the Share dialog shows. */
export async function getShareInfo(id: number): Promise<Result> {
  const user = await requireUser();
  return info(id, user);
}

async function managed(id: number) {
  const user = await requireUser();
  const a = await db.attachment.findUnique({ where: { id } });
  if (!a || a.messageId || a.groupMessageId || a.noteId || a.draft) return { user, a: null, error: "That file isn't available." };
  if (!canManageSharing(a, user)) return { user, a: null, error: "Only the person who uploaded it (or an admin) can change sharing." };
  return { user, a, error: null };
}

/**
 * General access: RESTRICTED / COMPANY / PUBLIC. Turning PUBLIC on makes a
 * public link (kept the same if it's switched off and on again). `expiryDays`
 * 0 = never.
 */
export async function setFileAccess(id: number, access: string, expiryDays = 0): Promise<Result> {
  const { user, a, error } = await managed(id);
  if (!a) return { ok: false, error: error! };
  if (!(ACCESS_LEVELS as readonly string[]).includes(access)) return { ok: false, error: "Unknown access level." };
  // A task's file is always visible to the team; only its public link can change.
  if (!isStandalone(a) && access === "RESTRICTED") return { ok: false, error: "Task files are visible to your whole team." };
  const days = Math.max(0, Math.min(365, Math.floor(expiryDays) || 0));
  await db.attachment.update({
    where: { id },
    data: {
      access,
      shareToken: access === "PUBLIC" ? (a.shareToken ?? crypto.randomBytes(24).toString("base64url")) : a.shareToken,
      shareExpiresAt: access === "PUBLIC" ? (days ? new Date(Date.now() + days * 86_400_000) : null) : a.shareExpiresAt,
    },
  });
  revalidatePath("/documents");
  return info(id, user);
}

/** A fresh public link — the old one stops working at once. */
export async function resetPublicLink(id: number): Promise<Result> {
  const { user, a, error } = await managed(id);
  if (!a) return { ok: false, error: error! };
  await db.attachment.update({ where: { id }, data: { shareToken: crypto.randomBytes(24).toString("base64url"), downloads: 0 } });
  return info(id, user);
}

/** Shares a Documents file with people; they're notified and see it under "Shared with me". */
export async function shareFileWith(id: number, userIds: number[]): Promise<Result> {
  const { user, a, error } = await managed(id);
  if (!a) return { ok: false, error: error! };
  if (!isStandalone(a)) return { ok: false, error: "Task files are already visible to your whole team." };
  const ids = Array.from(new Set(userIds.filter((n) => Number.isInteger(n) && n > 0 && n !== a.uploadedById))).slice(0, 50);
  const people = await db.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } });
  const existing = new Set((await db.attachmentShare.findMany({ where: { attachmentId: id } })).map((s) => s.userId));
  const fresh = people.filter((p) => !existing.has(p.id));
  if (fresh.length) {
    await db.attachmentShare.createMany({ data: fresh.map((p) => ({ attachmentId: id, userId: p.id })) });
    for (const p of fresh) {
      await pushNotification(p.id, `📄 ${user.name} shared a file with you: ${a.originalName}`, "/documents?tab=shared");
    }
  }
  revalidatePath("/documents");
  return info(id, user);
}

export async function unshareFile(id: number, userId: number): Promise<Result> {
  const { user, a, error } = await managed(id);
  if (!a) return { ok: false, error: error! };
  await db.attachmentShare.deleteMany({ where: { attachmentId: id, userId } });
  revalidatePath("/documents");
  return info(id, user);
}
