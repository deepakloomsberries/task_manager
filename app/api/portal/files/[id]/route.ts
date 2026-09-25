import path from "path";
import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getClientSession } from "@/lib/clientAuth";
import { UPLOAD_DIR } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** A task file, for a client — only on tasks shared with them, in their own projects. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getClientSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const contact = await db.clientContact.findUnique({ where: { id: session.contactId } });
  if (!contact?.active) return new NextResponse("Unauthorized", { status: 401 });

  const attachment = await db.attachment.findFirst({
    where: {
      id: Number(params.id) || 0,
      task: { clientVisible: true, deletedAt: null, project: { clientId: contact.clientId } },
    },
  });
  if (!attachment) return new NextResponse("Not found", { status: 404 });
  if (!attachment.storedName) {
    return attachment.externalUrl ? NextResponse.redirect(attachment.externalUrl) : new NextResponse("Not found", { status: 404 });
  }

  let data: Buffer;
  try {
    data = await fs.readFile(path.join(UPLOAD_DIR, attachment.storedName));
  } catch {
    return new NextResponse("File missing on disk", { status: 404 });
  }
  const download = req.nextUrl.searchParams.get("download") === "1";
  const safeName = attachment.originalName.replace(/[^\w.\- ()]/g, "_");
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Length": String(attachment.size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      // Uploaded HTML/SVG must never run as a page on our site.
      "Content-Security-Policy": "sandbox",
    },
  });
}
