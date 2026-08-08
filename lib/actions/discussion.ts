"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { deleteUpload } from "@/lib/storage";
import { pushNotification } from "@/lib/notify";
import { findMentionedIds } from "@/lib/mentions";

export type DiscussionAttachment = {
  id: number;
  name: string;
  mimeType: string;
  size: number;
};

export type PostedDiscussionMessage = {
  id: number;
  body: string;
  authorId: number;
  authorName: string;
  authorCompany: string;
  createdAt: string;
  attachments: DiscussionAttachment[];
};

/**
 * Posts a message to the company-wide discussion (optionally with
 * already-uploaded attachments) and returns it so the live board can reconcile
 * the optimistic bubble it already drew — no redirect, the page stays put.
 */
export async function postDiscussionMessage(
  rawBody: string,
  attachmentIds: number[] = []
): Promise<PostedDiscussionMessage | { error: string }> {
  const user = await requireUser();
  const body = String(rawBody ?? "").trim();
  const ids = (attachmentIds ?? []).filter((n) => Number.isFinite(n) && n > 0).slice(0, 10);

  if (!body && ids.length === 0) return { error: "empty" };
  if (body.length > 4000) return { error: "too long" };

  const msg = await db.discussionMessage.create({
    data: { body, authorId: user.id },
    include: { author: { include: { company: true } } },
  });

  // Link the author's freshly uploaded, not-yet-attached files to this message.
  if (ids.length > 0) {
    await db.attachment.updateMany({
      where: { id: { in: ids }, uploadedById: user.id, messageId: null, taskId: null, discussionMessageId: null },
      data: { discussionMessageId: msg.id },
    });
  }
  const attachments = await db.attachment.findMany({
    where: { discussionMessageId: msg.id },
    select: { id: true, originalName: true, mimeType: true, size: true },
    orderBy: { id: "asc" },
  });

  // Ping anyone @mentioned in the message.
  if (body) {
    const directory = await db.user.findMany({ where: { active: true }, select: { id: true, name: true } });
    const mentioned = new Set(findMentionedIds(body, directory));
    mentioned.delete(user.id);
    for (const id of Array.from(mentioned)) {
      await pushNotification(id, `${user.name} mentioned you in Discussion`, "/discussion");
    }
  }

  revalidatePath("/discussion");

  return {
    id: msg.id,
    body: msg.body,
    authorId: msg.authorId,
    authorName: msg.author.name,
    authorCompany: msg.author.company.code,
    createdAt: msg.createdAt.toISOString(),
    attachments: attachments.map((a) => ({
      id: a.id,
      name: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
    })),
  };
}

/**
 * Deletes a message for everyone. The author can delete their own; admins can
 * delete anyone's. The row is kept as a tombstone (body cleared, deletedAt set)
 * so other people's already-loaded bubbles flip to "deleted" on the next poll.
 */
export async function deleteDiscussionMessage(messageId: number): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const msg = await db.discussionMessage.findUnique({
    where: { id: messageId },
    include: { attachments: true },
  });
  if (!msg || msg.deletedAt) return { ok: false };
  if (msg.authorId !== user.id && user.role !== "ADMIN") return { ok: false };

  await Promise.all(msg.attachments.map((a) => deleteUpload(a.storedName)));
  await db.attachment.deleteMany({ where: { discussionMessageId: messageId } });
  await db.discussionMessage.update({
    where: { id: messageId },
    data: { body: "", deletedAt: new Date() },
  });

  revalidatePath("/discussion");
  return { ok: true };
}

/**
 * Non-JS fallback: a plain <form> post that redirects back to the board. The
 * live client uses `postDiscussionMessage` instead, but this keeps the page
 * working if JavaScript is unavailable.
 */
export async function postMessage(formData: FormData) {
  const user = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > 4000) redirect("/discussion");
  await db.discussionMessage.create({ data: { body, authorId: user.id } });
  revalidatePath("/discussion");
  redirect("/discussion");
}
