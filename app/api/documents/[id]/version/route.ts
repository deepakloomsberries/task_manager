import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { saveUpload, MAX_FILE_SIZE } from "@/lib/storage";
import { canManageSharing } from "@/lib/docAccess";

/**
 * Uploads a new version of a Documents file. The file keeps its id, sharing
 * and public link (so a link you already sent now gives the new version); the
 * previous file is kept under "Versions" and can be restored.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const a = await db.attachment.findUnique({ where: { id: Number(id) || 0 } });
  if (!a || a.messageId || a.groupMessageId || a.noteId || a.draft || a.deletedAt || !a.storedName) {
    return NextResponse.json({ error: "That file can't take a new version." }, { status: 404 });
  }
  if (!canManageSharing(a, { id: session.userId, role: session.role })) {
    return NextResponse.json({ error: "Only the person who uploaded it (or an admin) can add a version." }, { status: 403 });
  }
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "File is too large — maximum 50 MB." }, { status: 413 });

  const saved = await saveUpload(file);
  await db.$transaction([
    db.attachmentVersion.create({
      data: {
        attachmentId: a.id,
        storedName: a.storedName,
        originalName: a.originalName,
        mimeType: a.mimeType,
        size: a.size,
        uploadedById: a.uploadedById,
        createdAt: a.createdAt,
      },
    }),
    db.attachment.update({ where: { id: a.id }, data: { ...saved, createdAt: new Date() } }),
  ]);
  revalidatePath("/documents");
  return NextResponse.json({ ok: true });
}
