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

/** Delete several documents at once (Documents page bulk select). Skips any the
 *  current user isn't allowed to remove. */
export async function deleteAttachments(formData: FormData) {
  const user = await requireUser();
  const ids = String(formData.get("ids") || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) redirect("/documents");

  const attachments = await db.attachment.findMany({ where: { id: { in: ids } } });
  const deletable = attachments.filter(
    (a) => a.uploadedById === user.id || user.role === "ADMIN",
  );
  if (deletable.length > 0) {
    await db.attachment.deleteMany({ where: { id: { in: deletable.map((a) => a.id) } } });
    for (const a of deletable) await deleteUpload(a.storedName);
  }
  revalidatePath("/documents");
  redirect("/documents");
}
