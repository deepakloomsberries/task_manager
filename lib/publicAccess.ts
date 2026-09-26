import crypto from "crypto";
import { cookies } from "next/headers";

/**
 * Password-protected public links: after the right password, a cookie proves
 * it for 12 hours. The cookie is an HMAC of the link token and the current
 * password hash, so changing the password (or resetting the link) locks
 * everyone out again.
 */
const HOURS = 12;
const secret = () => `${process.env.AUTH_SECRET ?? "dev-secret-do-not-use-in-production"}:public-links`;
const cookieName = (kind: "f" | "b", token: string) => `pl_${kind}_${token.slice(0, 16)}`;
const proof = (token: string, hash: string) => crypto.createHmac("sha256", secret()).update(`${token}:${hash}`).digest("base64url");

export async function isUnlocked(kind: "f" | "b", token: string, passwordHash: string | null): Promise<boolean> {
  if (!passwordHash) return true;
  const got = (await cookies()).get(cookieName(kind, token))?.value;
  if (!got) return false;
  const want = proof(token, passwordHash);
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function rememberUnlock(kind: "f" | "b", token: string, passwordHash: string) {
  (await cookies()).set(cookieName(kind, token), proof(token, passwordHash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: HOURS * 3600,
    path: "/",
  });
}

/** A new random public-link token (32 url-safe characters). */
export const newToken = () => crypto.randomBytes(24).toString("base64url");
