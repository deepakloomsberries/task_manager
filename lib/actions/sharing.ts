"use server";

import { newToken } from "@/lib/publicAccess";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pushNotification } from "@/lib/notify";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { ACCESS_LEVELS, canManageSharing, canOpenStandalone, folderVisibleTo, isStandalone, publicLinkLive, type AccessLevel } from "@/lib/docAccess";
import { emailShell, sendMail } from "@/lib/mail";
import { LIMITS, hit, isLimited } from "@/lib/rateLimit";

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
  hasPassword: boolean;
  /** Folder it's in — everyone who can see the folder can see the file. */
  folderName: string | null;
  /** Client portals this file is shared into, and the ones it could be. */
  clients: { id: number; name: string }[];
  clientChoices: { id: number; name: string }[];
};

type Result = { ok: true; info: ShareInfo } | { ok: false; error: string };

async function load(id: number) {
  return db.attachment.findUnique({
    where: { id },
    include: {
      uploadedBy: { select: { name: true } },
      clientContact: { select: { name: true } },
      shares: { include: { user: { select: { id: true, name: true, jobTitle: true, avatarPath: true } } }, orderBy: { createdAt: "asc" } },
      clientShares: { include: { client: { select: { id: true, name: true } } } },
      folder: { select: { name: true } },
    },
  });
}

async function info(id: number, user: { id: number; role: string }): Promise<Result> {
  const a = await load(id);
  if (!a || a.messageId || a.groupMessageId || a.noteId || a.draft || a.deletedAt) return { ok: false, error: "That file isn't available." };
  const standalone = isStandalone(a);
  const inFolder = !!a.folderId && (await folderVisibleTo(a.folderId, user));
  if (standalone && !canOpenStandalone(a, user, a.shares.some((s) => s.userId === user.id), inFolder)) {
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
      hasPassword: !!a.sharePasswordHash,
      folderName: a.folder?.name ?? null,
      clients: a.clientShares.map((c) => c.client),
      clientChoices:
        canManage && (user.role === "ADMIN" || user.role === "MANAGER")
          ? await db.client.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
          : [],
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
  if (!a || a.messageId || a.groupMessageId || a.noteId || a.draft || a.deletedAt) return { user, a: null, error: "That file isn't available." };
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
      shareToken: access === "PUBLIC" ? (a.shareToken ?? newToken()) : a.shareToken,
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
  await db.attachment.update({ where: { id }, data: { shareToken: newToken(), downloads: 0 } });
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

/** Adds (or removes, with "") a password on the public link. */
export async function setPublicPassword(id: number, password: string): Promise<Result> {
  const { user, a, error } = await managed(id);
  if (!a) return { ok: false, error: error! };
  const pw = password.trim();
  if (pw && pw.length < 4) return { ok: false, error: "Use at least 4 characters." };
  await db.attachment.update({ where: { id }, data: { sharePasswordHash: pw ? await bcrypt.hash(pw, 10) : null } });
  return info(id, user);
}

/** Shares a file into a client's portal (managers and admins). */
export async function shareWithClient(id: number, clientId: number, on: boolean): Promise<Result> {
  const { user, a, error } = await managed(id);
  if (!a) return { ok: false, error: error! };
  if (user.role !== "ADMIN" && user.role !== "MANAGER") return { ok: false, error: "Only managers can share files with clients." };
  if (on) {
    const client = await db.client.findUnique({ where: { id: clientId } });
    if (!client) return { ok: false, error: "That client doesn't exist." };
    await db.clientFileShare.upsert({
      where: { attachmentId_clientId: { attachmentId: id, clientId } },
      create: { attachmentId: id, clientId },
      update: {},
    });
  } else {
    await db.clientFileShare.deleteMany({ where: { attachmentId: id, clientId } });
  }
  return info(id, user);
}

/** A QR code (SVG) for a link — to print on a sample tag or show on screen. */
export async function linkQr(url: string): Promise<string> {
  await requireUser();
  if (!/^https?:\/\//.test(url) || url.length > 500) return "";
  return QRCode.toString(url, { type: "svg", margin: 1, width: 180 });
}

/** Emails the file's link to people (the public link when there is one, else the in-app link). */
export async function sendFileLink(
  id: number,
  rawEmails: string,
  note: string,
  origin: string
): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const user = await requireUser();
  const r = await info(id, user);
  if (!r.ok) return r;
  const emails = Array.from(new Set(rawEmails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)));
  if (!emails.length) return { ok: false, error: "Enter at least one email address." };
  if (emails.length > 20) return { ok: false, error: "Up to 20 addresses at a time." };
  if (emails.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) return { ok: false, error: "One of those email addresses doesn't look right." };
  const key = `sendlink:${user.id}`;
  if (isLimited(key, LIMITS.sendLinkPerUser)) return { ok: false, error: "You've sent a lot of links — try again in an hour." };
  const base = /^https?:\/\/[^/]+$/.test(origin) ? origin : process.env.APP_URL ?? "";
  const link = r.info.linkLive && r.info.token ? `${base}/f/${r.info.token}` : `${base}/documents?file=${id}`;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = [
    `<b>${esc(user.name)}</b> from Looms &amp; Berries shared a file with you: <b>${esc(r.info.name)}</b>`,
    ...(note.trim() ? [`<i>"${esc(note.trim().slice(0, 1000))}"</i>`] : []),
    ...(r.info.hasPassword ? ["The link is password-protected — ask the sender for the password."] : []),
  ];
  for (const to of emails) {
    hit(key, LIMITS.sendLinkPerUser);
    await sendMail(to, `${user.name} shared "${r.info.name}" with you`, emailShell("A file for you", lines, link, "Open the file"));
  }
  return { ok: true, sent: emails.length };
}
