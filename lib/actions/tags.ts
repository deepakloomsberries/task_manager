"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { TAG_COLORS } from "@/lib/ui";

export async function addTagToTask(formData: FormData) {
  await requireUser();
  const taskId = Number(formData.get("taskId"));
  const name = String(formData.get("name") ?? "").trim().toLowerCase().slice(0, 30);
  const color = String(formData.get("color") ?? "slate");
  if (!taskId || !name) redirect(`/tasks/${taskId}`);

  const tag = await db.tag.upsert({
    where: { name },
    create: { name, color: TAG_COLORS.includes(color) ? color : "slate" },
    update: {},
  });
  await db.taskTag.upsert({
    where: { taskId_tagId: { taskId, tagId: tag.id } },
    create: { taskId, tagId: tag.id },
    update: {},
  });
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  redirect(`/tasks/${taskId}`);
}

export async function removeTagFromTask(formData: FormData) {
  await requireUser();
  const taskId = Number(formData.get("taskId"));
  const tagId = Number(formData.get("tagId"));
  await db.taskTag.deleteMany({ where: { taskId, tagId } });

  // Remove tags that are no longer used anywhere.
  const remaining = await db.taskTag.count({ where: { tagId } });
  if (remaining === 0) await db.tag.delete({ where: { id: tagId } });

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  redirect(`/tasks/${taskId}`);
}
