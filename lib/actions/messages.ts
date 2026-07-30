"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pushNotification } from "@/lib/notify";

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

export type SentMessage = {
  id: number;
  body: string;
  senderId: number;
  recipientId: number;
  createdAt: string;
};

/**
 * Sends a direct message and returns it so the chat UI can reconcile the
 * optimistic bubble it already drew. Unlike `sendDirectMessage`, this does not
 * redirect — the client stays put and keeps the conversation feeling live.
 */
export async function sendMessage(
  recipientId: number,
  rawBody: string
): Promise<SentMessage | { error: string }> {
  const user = await requireUser();
  const body = String(rawBody ?? "").trim();

  if (!recipientId || recipientId === user.id) return { error: "invalid recipient" };
  if (!body) return { error: "empty" };
  if (body.length > 4000) return { error: "too long" };

  const recipient = await db.user.findUnique({ where: { id: recipientId } });
  if (!recipient || !recipient.active) return { error: "recipient unavailable" };

  const msg = await db.directMessage.create({
    data: { body, senderId: user.id, recipientId },
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
  };
}
