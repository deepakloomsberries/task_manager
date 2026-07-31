"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** Where to return after an inbox action, preserving the current filter view. */
function backFrom(formData: FormData) {
  const back = String(formData.get("back") ?? "").trim();
  return back.startsWith("/notifications") ? back : "/notifications";
}

export async function markAllNotificationsRead(formData: FormData) {
  const user = await requireUser();
  await db.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });
  revalidatePath("/notifications");
  redirect(backFrom(formData));
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
  redirect(backFrom(formData));
}

/** Mark every notification for one thread (link) as read. */
export async function markThreadRead(formData: FormData) {
  const user = await requireUser();
  const link = String(formData.get("link") ?? "");
  await db.notification.updateMany({
    where: { userId: user.id, read: false, link: link || null },
    data: { read: true },
  });
  revalidatePath("/notifications");
  redirect(backFrom(formData));
}

export async function clearNotifications(formData: FormData) {
  const user = await requireUser();
  await db.notification.deleteMany({ where: { userId: user.id } });
  revalidatePath("/notifications");
  redirect(backFrom(formData));
}
