import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "dev-secret-do-not-use-in-production"
);

const COOKIE_NAME = "tm_session";
const SESSION_DAYS = 7;

export type SessionPayload = {
  userId: number;
  role: string;
};

/** Signs a session cookie. `version` is the user's current sessionVersion. */
export async function createSession(userId: number, role: string, version = 0) {
  const token = await new SignJWT({ userId, role, sv: version })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret);

  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE_NAME);
}

/** The signed cookie's contents, without checking the database. */
async function readSessionToken(): Promise<(SessionPayload & { sv: number }) | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.userId !== "number") return null;
    return { userId: payload.userId, role: String(payload.role ?? ""), sv: typeof payload.sv === "number" ? payload.sv : 0 };
  } catch {
    return null;
  }
}

/**
 * The signed-in person, checked against the database: the account must still
 * be active and the session not revoked (sessionVersion). The role comes from
 * the database too, so a demotion takes effect immediately.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const t = await readSessionToken();
  if (!t) return null;
  const u = await db.user.findUnique({ where: { id: t.userId }, select: { active: true, role: true, sessionVersion: true } });
  if (!u || !u.active || u.sessionVersion !== t.sv) return null;
  return { userId: t.userId, role: u.role };
}

/** Loads the full current user, redirecting to /login when not authenticated. */
export async function requireUser() {
  const t = await readSessionToken();
  if (!t) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: t.userId },
    include: { company: true, department: true },
  });
  // The cookie is valid-looking but no longer good: clear it on the way out.
  if (!user || !user.active || user.sessionVersion !== t.sv) redirect("/api/auth/signed-out");
  return user;
}

/**
 * Signs a person out on every device by moving their session version on.
 * Returns the new version (to re-issue the current device's cookie if needed).
 */
export async function revokeSessions(userId: number): Promise<number> {
  const u = await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } }, select: { sessionVersion: true } });
  return u.sessionVersion;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

export function isManagerOrAdmin(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}
