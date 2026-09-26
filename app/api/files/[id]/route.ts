import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sendAttachment } from "@/lib/fileResponse";
import { canOpenStandalone } from "@/lib/docAccess";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
  } else if (attachment.groupMessageId) {
    // Group-chat files are for that group's members.
    const msg = await db.groupMessage.findUnique({ where: { id: attachment.groupMessageId }, select: { groupId: true } });
    const member =
      msg && (await db.groupMember.findUnique({ where: { groupId_userId: { groupId: msg.groupId, userId: session.userId } } }));
    if (!member) return new NextResponse("Forbidden", { status: 403 });
  } else if (!attachment.taskId) {
    // Unsent chat-box drafts: only their uploader.
    if (attachment.draft && attachment.uploadedById !== session.userId) return new NextResponse("Forbidden", { status: 403 });
    // Documents files: their General access / who they're shared with.
    if (!attachment.draft) {
      const shared = !!(await db.attachmentShare.findUnique({
        where: { attachmentId_userId: { attachmentId: attachment.id, userId: session.userId } },
      }));
      if (!canOpenStandalone(attachment, { id: session.userId, role: session.role }, shared)) return new NextResponse("Forbidden", { status: 403 });
    }
  }

  return sendAttachment(attachment, req.nextUrl.searchParams.get("download") === "1");
}
