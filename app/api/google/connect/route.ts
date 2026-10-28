import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { authUrl, googleConfigured } from "@/lib/googleMeet";

export const dynamic = "force-dynamic";

/**
 * Starts "Connect Google account" for Meet calls. ?for=org (admins, the whole
 * team's calls) or ?for=me (your own calls). A one-time state value in a
 * cookie ties Google's reply back to this browser.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const target = new URL(req.url).searchParams.get("for") === "org" ? "org" : "me";
  const back = (q: string) => NextResponse.redirect(new URL(`/settings?${q}#calls`, process.env.APP_URL ?? req.url));
  if (!googleConfigured()) return back("error=google-setup");
  if (target === "org" && user.role !== "ADMIN") return back("error=google-admin");
  const nonce = randomBytes(18).toString("base64url");
  const res = NextResponse.redirect(authUrl(nonce, target === "me" ? user.email : undefined));
  res.cookies.set("g_oauth", `${nonce}.${target}.${user.id}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/api/google",
  });
  return res;
}
