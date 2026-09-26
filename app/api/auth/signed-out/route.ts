import { NextRequest, NextResponse } from "next/server";

/**
 * Clears a session cookie that no longer works (signed out elsewhere, account
 * deactivated, password changed) and goes to the login page. Without this the
 * middleware would see a valid-looking cookie and bounce /login back to the
 * app, which would bounce back to /login forever.
 */
export async function GET(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const isLocal = /^(localhost|127\.)/.test(host) || host.endsWith(":3000") || host.endsWith(":3100");
  const proto = isLocal ? (req.headers.get("x-forwarded-proto") ?? "http") : "https";
  const res = NextResponse.redirect(`${proto}://${host}/login?error=signed-out`);
  res.cookies.delete("tm_session");
  return res;
}
