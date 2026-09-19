import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { saveUpload, MAX_FILE_SIZE } from "@/lib/storage";

/**
 * Uploads a task/document attachment. A plain JSON API route rather than a
 * server action specifically so the client can drive it with XMLHttpRequest
 * and get real upload-progress events (fetch — what a server action uses
 * under the hood — has no upload progress API) — see PasteAttachment.tsx.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const taskId = form.get("taskId") ? Number(form.get("taskId")) : null;

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Please choose a file to upload." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File is too large — maximum size is 50 MB. For a bigger file, add a link instead." },
      { status: 413 }
    );
  }
  if (taskId) {
    const task = await db.task.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!task) return NextResponse.json({ error: "That task no longer exists." }, { status: 404 });
  }

  const saved = await saveUpload(file);
  const attachment = await db.attachment.create({
    data: { ...saved, taskId, uploadedById: session.userId },
  });

  revalidatePath(taskId ? `/tasks/${taskId}` : "/documents");

  return NextResponse.json({
    id: attachment.id,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
  });
}
