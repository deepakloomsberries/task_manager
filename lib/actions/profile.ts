"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { saveUpload, deleteUpload } from "@/lib/storage";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB

export async function updateAvatar(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("avatar");

  if (!(file instanceof File) || file.size === 0) redirect("/settings?error=avatar");
  if (file.size > MAX_AVATAR_SIZE || !file.type.startsWith("image/")) {
    redirect("/settings?error=avatar");
  }

  const saved = await saveUpload(file);
  const previous = user.avatarPath;
  await db.user.update({ where: { id: user.id }, data: { avatarPath: saved.storedName } });
  if (previous) await deleteUpload(previous);

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  redirect("/settings?ok=1");
}

export async function removeAvatar() {
  const user = await requireUser();
  if (user.avatarPath) {
    await deleteUpload(user.avatarPath);
    await db.user.update({ where: { id: user.id }, data: { avatarPath: null } });
  }
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  redirect("/settings?ok=1");
}
