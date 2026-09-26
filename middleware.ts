import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose/jwt/verify";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-secret-do-not-use-in-production"
);

// Client-portal tokens use their own key (see lib/clientAuth.ts) — keep in sync.
const clientSecret = new TextEncoder().encode(
  `${process.env.AUTH_SECRET ?? "dev-secret-do-not-use-in-production"}:client-portal`
);

const PUBLIC_PATHS = ["/login", "/forgot"];
// Public regardless of auth state, in either direction — unlike /login and
// /forgot, an already-signed-in visitor should still be able to see this
// (e.g. checking their own marketing page), not get bounced to /dashboard.
const ALWAYS_PUBLIC_PATHS = ["/about", "/use", "/f"]; // /f/<token> = public file links
// Exact path or a sub-path — never a bare prefix, so "/use" can't expose "/users".
const matchesPath = (pathname: string, p: string) => pathname === p || pathname.startsWith(`${p}/`);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (ALWAYS_PUBLIC_PATHS.some((p) => matchesPath(pathname, p))) return NextResponse.next();

  // The client portal has its own sign-in and never touches staff sessions.
  if (matchesPath(pathname, "/portal")) return portal(req, pathname);

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

  const redirectTo = redirector(req);

  if (!isPublic && !authenticated) return redirectTo("/login");
  if (isPublic && authenticated) return redirectTo("/dashboard");
  if (pathname === "/") return redirectTo(authenticated ? "/dashboard" : "/login");

  // Expose the path to server components (used to force the password change).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

/** Redirect helper that keeps the browser on the host it came in on. */
function redirector(req: NextRequest) {
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
  return (path: string) => NextResponse.redirect(`${proto}://${host}${path}`);
}

async function portal(req: NextRequest, pathname: string) {
  const token = req.cookies.get("tm_client")?.value;
  let signedIn = false;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, clientSecret);
      signedIn = payload.kind === "client";
    } catch {
      signedIn = false;
    }
  }
  const isLogin = matchesPath(pathname, "/portal/login");
  const redirectTo = redirector(req);
  // A signed-in visitor may still see the login page — their contact could
  // have been deactivated since (the page itself sends valid ones onwards).
  if (!signedIn && !isLogin) return redirectTo("/portal/login");
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    // marketing/ and guide/ hold the public /about and /use pages' screenshots —
    // static assets, never auth-gated, same as the icon files already excluded here.
    "/((?!_next/static|_next/image|favicon.ico|api|manifest.webmanifest|sw.js|icon.png|icon-192.png|icon-512.png|apple-touch-icon.png|marketing/|guide/).*)",
  ],
};
