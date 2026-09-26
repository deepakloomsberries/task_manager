"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { publicLinkLive } from "@/lib/docAccess";
import { rememberUnlock } from "@/lib/publicAccess";
import { LIMITS, clientIp, hit, isLimited } from "@/lib/rateLimit";

/** The password form on a protected public link (/f/<token> or /b/<token>). No sign-in. */
export async function unlockPublicLink(formData: FormData) {
  const kind = formData.get("kind") === "b" ? "b" : "f";
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const page = `/${kind}/${encodeURIComponent(token)}`;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) redirect("/");
  const ipKey = `public-pw:${clientIp(await headers())}`;
  if (isLimited(ipKey, LIMITS.publicPasswordPerIp)) redirect(`${page}?error=locked`);

  let hash: string | null = null;
  if (kind === "f") {
    const a = await db.attachment.findFirst({ where: { shareToken: token } });
    if (a && publicLinkLive(a)) hash = a.sharePasswordHash;
  } else {
    const bnd = await db.fileBundle.findFirst({ where: { token, disabled: false } });
    if (bnd && (!bnd.expiresAt || bnd.expiresAt > new Date())) hash = bnd.passwordHash;
  }
  if (!hash) redirect(page);
  if (!(await bcrypt.compare(password, hash))) {
    hit(ipKey, LIMITS.publicPasswordPerIp);
    redirect(`${page}?error=1`);
  }
  await rememberUnlock(kind, token, hash);
  redirect(page);
}
