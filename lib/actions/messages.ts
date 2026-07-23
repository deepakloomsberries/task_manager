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
