import path from "path";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const user = await db.user.findUnique({
    where: { id: Number(params.id) },
    select: { avatarPath: true },
  });
  if (!user?.avatarPath) return new NextResponse("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await fs.readFile(path.join(UPLOAD_DIR, user.avatarPath));
  } catch {
    return new NextResponse("File missing on disk", { status: 404 });
  }

  const ext = path.extname(user.avatarPath).toLowerCase();
  const mime =
    ext === ".png" ? "image/png"
    : ext === ".gif" ? "image/gif"
    : ext === ".webp" ? "image/webp"
    : ext === ".svg" ? "image/svg+xml"
    : "image/jpeg";

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
