import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-secret-do-not-use-in-production"
);

const PUBLIC_PATHS = ["/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const token = req.cookies.get("tm_session")?.value;

  let authenticated = false;
  if (token) {
    try {
      await jwtVerify(token, secret);
      authenticated = true;
    } catch {
      authenticated = false;
    }
  }

  if (!isPublic && !authenticated) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isPublic && authenticated) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = authenticated ? "/dashboard" : "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|manifest.webmanifest|sw.js|icon-192.png|icon-512.png|apple-touch-icon.png).*)",
  ],
};
