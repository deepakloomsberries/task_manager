import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * The half-way state between "password correct" and "signed in" for people
 * with two-step sign-in: a short-lived cookie, signed with its own key so it
 * can never pass as a real session.
 */
const COOKIE = "tm_2fa";
const MINUTES = 10;

const key = () => new TextEncoder().encode(`${process.env.AUTH_SECRET ?? "dev-secret-do-not-use-in-production"}:two-step`);

export async function startTwoStep(userId: number) {
  const token = await new SignJWT({ userId, stage: "2fa" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MINUTES}m`)
    .sign(key());
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MINUTES * 60,
    path: "/",
  });
}

export async function pendingTwoStep(): Promise<number | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload.stage === "2fa" && typeof payload.userId === "number" ? payload.userId : null;
  } catch {
    return null;
  }
}

export function endTwoStep() {
  cookies().delete(COOKIE);
}

/** Admins must use two-step sign-in unless ADMIN_TWO_STEP=optional in .env. */
export function adminTwoStepRequired() {
  return (process.env.ADMIN_TWO_STEP ?? "required").toLowerCase() !== "optional";
}
