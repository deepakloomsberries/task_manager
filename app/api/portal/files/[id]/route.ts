import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getClientSession } from "@/lib/clientAuth";
import { sendAttachment } from "@/lib/fileResponse";

export const dynamic = "force-dynamic";

/** A task file, for a client — only files shared with them (or their own), on shared tasks in their projects. */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getClientSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const contact = await db.clientContact.findUnique({ where: { id: session.contactId } });
  if (!contact?.active) return new NextResponse("Unauthorized", { status: 401 });

  const attachment = await db.attachment.findFirst({
    where: {
      id: Number(params.id) || 0,
      clientVisible: true,
      task: { clientVisible: true, deletedAt: null, project: { clientId: contact.clientId } },
    },
  });
  if (!attachment) return new NextResponse("Not found", { status: 404 });
  return sendAttachment(attachment, req.nextUrl.searchParams.get("download") === "1");
}
