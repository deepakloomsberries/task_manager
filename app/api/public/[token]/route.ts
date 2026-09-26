import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { sendAttachment } from "@/lib/fileResponse";
import { publicLinkLive } from "@/lib/docAccess";
import { isUnlocked } from "@/lib/publicAccess";
import { LIMITS, clientIp, hit, isLimited } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** The file behind a public link (/f/<token>). No sign-in; only live PUBLIC links. */
export async function GET(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const ipKey = `public-file:${clientIp(await headers())}`;
  if (isLimited(ipKey, LIMITS.publicFilePerIp)) return new NextResponse("Too many requests — try again in a few minutes.", { status: 429 });
  hit(ipKey, LIMITS.publicFilePerIp);

  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new NextResponse("Not found", { status: 404 });
  const a = await db.attachment.findFirst({ where: { shareToken: token } });
  if (!a || !publicLinkLive(a)) return new NextResponse("This link isn't available any more.", { status: 404 });
  if (!(await isUnlocked("f", token, a.sharePasswordHash))) return new NextResponse("This link needs a password.", { status: 403 });

  const download = req.nextUrl.searchParams.get("download") === "1";
  if (download || !a.storedName) await db.attachment.update({ where: { id: a.id }, data: { downloads: { increment: 1 }, lastDownloadAt: new Date() } });
  const res = await sendAttachment(a, download);
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
