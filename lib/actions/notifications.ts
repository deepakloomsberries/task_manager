"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await db.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });
  revalidatePath("/notifications");
  redirect("/notifications");
}

/** Flip a single notification between read and unread. */
export async function toggleNotificationRead(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const notification = await db.notification.findFirst({ where: { id, userId: user.id } });
  if (notification) {
    await db.notification.update({
      where: { id },
      data: { read: !notification.read },
    });
  }
  revalidatePath("/notifications");
  redirect("/notifications");
}

export async function clearNotifications() {
  const user = await requireUser();
  await db.notification.deleteMany({ where: { userId: user.id } });
  revalidatePath("/notifications");
  redirect("/notifications");
}
