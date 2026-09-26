import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/storage";
import { canUserOpen } from "@/lib/fileAccess";

export const dynamic = "force-dynamic";

const THUMB_DIR = path.join(UPLOAD_DIR, ".thumbs");
const SIZE = 360;

/**
 * A small WebP preview of an image file for the Documents grid. Made once and
 * cached next to the uploads (the nightly cleanup removes thumbnails of
 * deleted files). Same access rules as opening the file.
 */
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });
  const a = await db.attachment.findUnique({ where: { id: Number(id) || 0 } });
  if (!a || !a.storedName || !a.mimeType.startsWith("image/") || a.mimeType === "image/svg+xml") {
    return new NextResponse("No preview", { status: 404 });
  }
  if (!(await canUserOpen(a, { id: session.userId, role: session.role }))) return new NextResponse("Forbidden", { status: 403 });

  const cached = path.join(THUMB_DIR, `${a.storedName}.webp`);
  let data: Buffer;
  try {
    data = await fs.readFile(cached);
  } catch {
    try {
      data = await sharp(path.join(UPLOAD_DIR, a.storedName), { failOn: "none" })
        .rotate()
        .resize(SIZE, SIZE, { fit: "cover" })
        .webp({ quality: 72 })
        .toBuffer();
      await fs.mkdir(THUMB_DIR, { recursive: true });
      await fs.writeFile(cached, data);
    } catch {
      return new NextResponse("No preview", { status: 404 });
    }
  }
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
