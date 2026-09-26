import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sendAttachment } from "@/lib/fileResponse";
import { canUserOpen } from "@/lib/fileAccess";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const attachment = await db.attachment.findUnique({ where: { id: Number(params.id) } });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const me = { id: session.userId, role: session.role };
  if (!(await canUserOpen(attachment, me))) return new NextResponse("Forbidden", { status: 403 });

  // "Recent" in Documents: remember that this person opened it.
  if (!attachment.messageId && !attachment.groupMessageId && !attachment.noteId && !attachment.draft) {
    void db.fileView
      .upsert({
        where: { userId_attachmentId: { userId: me.id, attachmentId: attachment.id } },
        create: { userId: me.id, attachmentId: attachment.id },
        update: { viewedAt: new Date() },
      })
      .catch(() => {});
  }
  return sendAttachment(attachment, req.nextUrl.searchParams.get("download") === "1");
}
