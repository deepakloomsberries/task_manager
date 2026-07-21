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

export async function clearNotifications() {
  const user = await requireUser();
  await db.notification.deleteMany({ where: { userId: user.id } });
  revalidatePath("/notifications");
  redirect("/notifications");
}
