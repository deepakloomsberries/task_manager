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

  // Build redirects from the request's Host header, not the interface the
  // server is bound to — otherwise a server started with -H 127.0.0.1 behind
  // a reverse proxy redirects browsers to localhost.
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  // Local/direct access (localhost or the raw Node port) keeps its own scheme;
  // anything arriving under a real domain is always served over HTTPS, so the
  // reverse proxy does not need to inject X-Forwarded-Proto.
  const isLocal = /^(localhost|127\.)/.test(host) || host.endsWith(":3000");
  const proto = isLocal ? (req.headers.get("x-forwarded-proto") ?? "http") : "https";
  const redirectTo = (path: string) => NextResponse.redirect(`${proto}://${host}${path}`);

  if (!isPublic && !authenticated) return redirectTo("/login");
  if (isPublic && authenticated) return redirectTo("/dashboard");
  if (pathname === "/") return redirectTo(authenticated ? "/dashboard" : "/login");

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|manifest.webmanifest|sw.js|icon.png|icon-192.png|icon-512.png|apple-touch-icon.png).*)",
  ],
};
