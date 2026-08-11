"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { saveUpload, deleteUpload, MAX_FILE_SIZE } from "@/lib/storage";

export async function uploadAttachment(formData: FormData) {
  const user = await requireUser();
  const taskId = formData.get("taskId") ? Number(formData.get("taskId")) : null;
  const back = taskId ? `/tasks/${taskId}` : "/documents";

  // Accept one or many files (the picker allows multi-select).
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) redirect(`${back}?error=nofile`);
  if (files.some((f) => f.size > MAX_FILE_SIZE)) redirect(`${back}?error=toobig`);
  if (taskId && !(await db.task.findUnique({ where: { id: taskId } }))) redirect("/tasks");

  for (const file of files) {
    const saved = await saveUpload(file);
    await db.attachment.create({ data: { ...saved, taskId, uploadedById: user.id } });
  }
  revalidatePath(back);
  redirect(back);
}

export async function deleteAttachment(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment) redirect("/documents");

  const back = attachment.taskId ? `/tasks/${attachment.taskId}` : "/documents";
  if (attachment.uploadedById !== user.id && user.role !== "ADMIN") redirect(back);

  await db.attachment.delete({ where: { id } });
  await deleteUpload(attachment.storedName);
  revalidatePath(back);
  redirect(back);
}
