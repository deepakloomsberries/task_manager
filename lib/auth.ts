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

export async function createSession(userId: number, role: string) {
  const token = await new SignJWT({ userId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret);

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export function destroySession() {
  cookies().delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: payload.userId as number,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

/** Loads the full current user, redirecting to /login when not authenticated. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { company: true, department: true },
  });
  if (!user || !user.active) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

export function isManagerOrAdmin(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}
