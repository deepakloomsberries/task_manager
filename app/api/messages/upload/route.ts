import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { saveUpload, MAX_FILE_SIZE } from "@/lib/storage";

/**
 * Uploads a chat attachment (a chosen file or a pasted screenshot). The file is
 * stored immediately and returned to the composer; it is linked to a message
 * only when that message is actually sent. Attachments that are never sent stay
 * orphaned and can be cleaned up later.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no file" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "too large" }, { status: 413 });
  }

  const saved = await saveUpload(file);
  const attachment = await db.attachment.create({
    data: { ...saved, uploadedById: session.userId },
  });

  return NextResponse.json({
    id: attachment.id,
    name: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
  });
}
