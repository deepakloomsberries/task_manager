"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { folderVisibleTo } from "@/lib/docAccess";
import { deleteUpload } from "@/lib/storage";

// File uploads themselves go through POST /api/attachments/upload (a plain
// route, not a server action) — the client drives it with XMLHttpRequest to
// get real upload-progress events, which fetch/server-actions can't report.
// See PasteAttachment.tsx.

/**
 * Attaches a link instead of a file — for something too large to upload
 * (a designer's 100-500 MB source file, say): share it via Drive/Dropbox/
 * WeTransfer and point to it here instead. Shows up alongside real
 * attachments everywhere they're listed, but opens externally rather than
 * being served from this app.
 */
export async function addAttachmentLink(formData: FormData) {
  const user = await requireUser();
  const taskId = formData.get("taskId") ? Number(formData.get("taskId")) : null;
  const rawFolder = !taskId && formData.get("folderId") ? Number(formData.get("folderId")) : null;
  const folderId = rawFolder && (await folderVisibleTo(rawFolder, user)) ? rawFolder : null;
  const back = taskId ? `/tasks/${taskId}` : folderId ? `/documents?folder=${folderId}` : "/documents";

  const rawUrl = String(formData.get("url") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim().slice(0, 200);

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    redirect(`${back}?error=badlink`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") redirect(`${back}?error=badlink`);
  if (taskId && !(await db.task.findUnique({ where: { id: taskId } }))) redirect("/tasks");

  await db.attachment.create({
    data: {
      storedName: null,
      originalName: label || url.hostname + url.pathname,
      mimeType: "text/uri-list",
      size: 0,
      externalUrl: url.toString(),
      taskId,
      folderId,
      ...(folderId ? { access: "RESTRICTED" } : {}),
      uploadedById: user.id,
    },
  });

  revalidatePath(back);
  redirect(back);
}

/** Files that live in Documents (task and standalone files) — deleting them uses the bin. */
function inDocuments(a: { messageId: number | null; groupMessageId: number | null; noteId: number | null; draft: boolean }) {
  return !a.messageId && !a.groupMessageId && !a.noteId && !a.draft;
}

export async function deleteAttachment(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment) redirect("/documents");

  const fallback = attachment.taskId ? `/tasks/${attachment.taskId}` : attachment.noteId ? "/notes" : "/documents";
  // A task attachment's delete button passes along the filtered list/board the
  // person opened the task from, so this redirect doesn't strip it.
  const backField = formData.get("back");
  const back =
    typeof backField === "string" && (backField.startsWith("/tasks") || backField.startsWith("/documents")) && !backField.startsWith("//")
      ? backField
      : fallback;
  // A client's upload has no staff uploader: managers and the task owner may remove it.
  let clientFileManager = false;
  if (attachment.clientContactId && attachment.taskId) {
    const task = await db.task.findUnique({ where: { id: attachment.taskId }, select: { createdById: true } });
    clientFileManager = user.role === "MANAGER" || task?.createdById === user.id;
  }
  if (attachment.uploadedById !== user.id && user.role !== "ADMIN" && !clientFileManager) redirect(back);

  if (inDocuments(attachment)) {
    // Documents and task files go to the bin for 30 days (restore from Documents → Bin).
    await db.attachment.update({ where: { id }, data: { deletedAt: new Date(), deletedById: user.id } });
  } else {
    await db.attachment.delete({ where: { id } });
    await deleteUpload(attachment.storedName);
  }
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
    await db.attachment.updateMany({
      where: { id: { in: deletable.map((a) => a.id) } },
      data: { deletedAt: new Date(), deletedById: user.id },
    });
  }
  revalidatePath("/documents");
  redirect("/documents");
}
