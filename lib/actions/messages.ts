"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pushNotification } from "@/lib/notify";
import { deleteUpload } from "@/lib/storage";

export async function sendDirectMessage(formData: FormData) {
  const user = await requireUser();
  const recipientId = Number(formData.get("recipientId"));
  const body = String(formData.get("body") ?? "").trim();

  if (!recipientId || recipientId === user.id) redirect("/messages");
  if (!body || body.length > 4000) redirect(`/messages/${recipientId}`);

  const recipient = await db.user.findUnique({ where: { id: recipientId } });
  if (!recipient || !recipient.active) redirect("/messages");

  await db.directMessage.create({
    data: { body, senderId: user.id, recipientId },
  });
  await pushNotification(recipientId, `${user.name} sent you a message`, `/messages/${user.id}`);

  revalidatePath(`/messages/${recipientId}`);
  revalidatePath("/messages");
  redirect(`/messages/${recipientId}`);
}

/**
 * Deletes one of your own messages for everyone. The row is kept as a tombstone
 * (so both sides can show "This message was deleted"), but its body is cleared
 * and any attachments are removed from disk and the database.
 */
export async function deleteMessage(messageId: number): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const msg = await db.directMessage.findUnique({
    where: { id: messageId },
    include: { attachments: true },
  });
  if (!msg || msg.senderId !== user.id || msg.deletedAt) return { ok: false };

  await Promise.all(msg.attachments.map((a) => deleteUpload(a.storedName)));
  await db.attachment.deleteMany({ where: { messageId } });
  await db.directMessage.update({
    where: { id: messageId },
    data: { body: "", deletedAt: new Date() },
  });

  revalidatePath("/messages");
  return { ok: true };
}

export type MessageAttachment = {
  id: number;
  name: string;
  mimeType: string;
  size: number;
};

export type SentMessage = {
  id: number;
  body: string;
  senderId: number;
  recipientId: number;
  createdAt: string;
  attachments: MessageAttachment[];
};

/**
 * Sends a direct message (optionally with already-uploaded attachments) and
 * returns it so the chat UI can reconcile the optimistic bubble it already
 * drew. Unlike `sendDirectMessage`, this does not redirect — the client stays
 * put and keeps the conversation feeling live.
 */
export async function sendMessage(
  recipientId: number,
  rawBody: string,
  attachmentIds: number[] = []
): Promise<SentMessage | { error: string }> {
  const user = await requireUser();
  const body = String(rawBody ?? "").trim();
  const ids = (attachmentIds ?? []).filter((n) => Number.isFinite(n) && n > 0).slice(0, 10);

  if (!recipientId || recipientId === user.id) return { error: "invalid recipient" };
  if (!body && ids.length === 0) return { error: "empty" };
  if (body.length > 4000) return { error: "too long" };

  const recipient = await db.user.findUnique({ where: { id: recipientId } });
  if (!recipient || !recipient.active) return { error: "recipient unavailable" };

  const msg = await db.directMessage.create({
    data: { body, senderId: user.id, recipientId },
  });

  // Link the sender's freshly uploaded, not-yet-attached files to this message.
  if (ids.length > 0) {
    await db.attachment.updateMany({
      where: { id: { in: ids }, uploadedById: user.id, messageId: null, taskId: null },
      data: { messageId: msg.id },
    });
  }
  const attachments = await db.attachment.findMany({
    where: { messageId: msg.id },
    select: { id: true, originalName: true, mimeType: true, size: true },
    orderBy: { id: "asc" },
  });

  await pushNotification(recipientId, `${user.name} sent you a message`, `/messages/${user.id}`);

  // Refresh the conversations list (unread counts / previews) without navigating.
  revalidatePath("/messages");

  return {
    id: msg.id,
    body: msg.body,
    senderId: msg.senderId,
    recipientId: msg.recipientId,
    createdAt: msg.createdAt.toISOString(),
    attachments: attachments.map((a) => ({
      id: a.id,
      name: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
    })),
  };
}
