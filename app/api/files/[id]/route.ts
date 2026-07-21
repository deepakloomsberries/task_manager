import path from "path";
import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const attachment = await db.attachment.findUnique({ where: { id: Number(params.id) } });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

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
    },
  });
}
