import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sendAttachment } from "@/lib/fileResponse";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const attachment = await db.attachment.findUnique({ where: { id: Number(params.id) } });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  // Direct-message attachments are private to the two people in the thread.
  if (attachment.messageId) {
    const msg = await db.directMessage.findUnique({
      where: { id: attachment.messageId },
      select: { senderId: true, recipientId: true },
    });
    if (!msg || (msg.senderId !== session.userId && msg.recipientId !== session.userId)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  } else if (attachment.discussionMessageId) {
    // Discussion attachments belong to the company-wide board: any signed-in
    // user may view them.
  } else if (attachment.noteId) {
    // Note attachments are private to the note's owner and anyone it's shared with.
    const note = await db.note.findUnique({
      where: { id: attachment.noteId },
      select: { userId: true, shares: { select: { userId: true } } },
    });
    const allowed =
      note && (note.userId === session.userId || note.shares.some((s) => s.userId === session.userId));
    if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  } else if (!attachment.taskId && attachment.uploadedById !== session.userId) {
    // A freshly uploaded, not-yet-attached file is only visible to its uploader.
    return new NextResponse("Forbidden", { status: 403 });
  }

  return sendAttachment(attachment, req.nextUrl.searchParams.get("download") === "1");
}
