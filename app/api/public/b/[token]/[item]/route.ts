import path from "path";
import { Readable } from "stream";
import archiver from "archiver";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { UPLOAD_DIR } from "@/lib/storage";
import { sendAttachment } from "@/lib/fileResponse";
import { openBundle } from "@/lib/bundleAccess";
import { LIMITS, clientIp, hit, isLimited } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** One file from a public bundle (/api/public/b/<token>/<id>) or all of them as a zip (…/zip). */
export async function GET(req: NextRequest, props: { params: Promise<{ token: string; item: string }> }) {
  const { token, item } = await props.params;
  const ipKey = `public-file:${clientIp(await headers())}`;
  if (isLimited(ipKey, LIMITS.publicFilePerIp)) return new NextResponse("Too many requests — try again in a few minutes.", { status: 429 });
  hit(ipKey, LIMITS.publicFilePerIp);

  const { bundle, locked } = await openBundle(token);
  if (!bundle) return new NextResponse("This link isn't available any more.", { status: 404 });
  if (locked) return new NextResponse("This link needs a password.", { status: 403 });

  if (item === "zip") {
    const files = bundle.items.map((i) => i.attachment).filter((a) => a.storedName);
    await db.fileBundle.update({ where: { id: bundle.id }, data: { downloads: { increment: 1 } } });
    const zip = archiver("zip", { zlib: { level: 5 } });
    const used = new Set<string>();
    for (const a of files) {
      // Two files with the same name get " (2)" so neither is lost in the zip.
      let name = a.originalName.replace(/[\\/]/g, "_");
      for (let n = 2; used.has(name.toLowerCase()); n++) name = a.originalName.replace(/(\.[^.]*)?$/, ` (${n})$1`);
      used.add(name.toLowerCase());
      zip.file(path.join(UPLOAD_DIR, a.storedName!), { name });
    }
    void zip.finalize();
    const safe = bundle.title.replace(/[^\w.\- ()]/g, "_").slice(0, 80) || "files";
    return new NextResponse(Readable.toWeb(zip) as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safe}.zip"`,
        "X-Robots-Tag": "noindex",
      },
    });
  }

  const a = bundle.items.map((i) => i.attachment).find((x) => x.id === Number(item));
  if (!a) return new NextResponse("Not found", { status: 404 });
  const download = req.nextUrl.searchParams.get("download") === "1";
  if (download) await db.fileBundle.update({ where: { id: bundle.id }, data: { downloads: { increment: 1 } } });
  const res = await sendAttachment(a, download);
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
