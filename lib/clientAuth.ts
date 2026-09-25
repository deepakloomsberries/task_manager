import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

/**
 * Client-portal sessions. Kept fully separate from staff sessions: a different
 * cookie AND a different signing key, so a client's token can never pass as a
 * staff session (or the other way round), even if someone copies it across.
 */
export const CLIENT_COOKIE = "tm_client";
const SESSION_DAYS = 14;

export function clientSecret() {
  return new TextEncoder().encode(`${process.env.AUTH_SECRET ?? "dev-secret-do-not-use-in-production"}:client-portal`);
}

export async function createClientSession(contactId: number) {
  const token = await new SignJWT({ contactId, kind: "client" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(clientSecret());
  cookies().set(CLIENT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export function destroyClientSession() {
  cookies().delete(CLIENT_COOKIE);
}

export async function getClientSession(): Promise<{ contactId: number } | null> {
  const token = cookies().get(CLIENT_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, clientSecret());
    if (payload.kind !== "client" || typeof payload.contactId !== "number") return null;
    return { contactId: payload.contactId };
  } catch {
    return null;
  }
}

/** The signed-in client contact (with their client), or off to the portal login. */
export async function requireClient() {
  const session = await getClientSession();
  if (!session) redirect("/portal/login");
  const contact = await db.clientContact.findUnique({ where: { id: session.contactId }, include: { client: true } });
  if (!contact || !contact.active) redirect("/portal/login?error=1");
  return contact;
}

/**
 * A task this client may see: shared with clients, not deleted, in one of the
 * client's projects. Null otherwise — callers show "not found".
 */
export async function clientTask(clientId: number, taskId: number) {
  if (!Number.isInteger(taskId)) return null;
  return db.task.findFirst({
    where: { id: taskId, clientVisible: true, deletedAt: null, project: { clientId } },
    include: { project: true },
  });
}
