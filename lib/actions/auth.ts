"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { isStrongPassword } from "@/lib/password";
import { notifyPasswordOtp } from "@/lib/mail";
import { CHAT_LANGUAGES } from "@/lib/ui";
import { LIMITS, clientIp, hit, isLimited, reset as clearLimit } from "@/lib/rateLimit";
import { adminTwoStepRequired, endTwoStep, pendingTwoStep, startTwoStep } from "@/lib/twoFactor";
import { recoveryCodesLeft, consumeRecoveryCode, verifyTotp } from "@/lib/totp";

const OTP_TTL_MIN = 15;
const OTP_MAX_ATTEMPTS = 5; // wrong-code guesses before the code is invalidated
const OTP_MAX_SENDS = 5; // codes we'll email within one active window (resend cap)

// bcrypt hash of a random string, compared against when the email is unknown.
const DUMMY_HASH = "$2b$10$CC6rVNOW008B.W6HG3wfp.vMNi6Wy/w7CG0R24JCyCtPp8eV0j5vi";

/** Where to go after signing in: Settings while a required setup step is open. */
function landingFor(user: { mustChangePassword: boolean; role: string; totpEnabled: boolean }) {
  if (user.mustChangePassword) return "/settings?first=1";
  if (user.role === "ADMIN" && !user.totpEnabled && adminTwoStepRequired()) return "/settings";
  return "/dashboard";
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const ip = clientIp(await headers());
  const emailKey = `login:email:${email}`;
  const ipKey = `login:ip:${ip}`;
  if (isLimited(emailKey, LIMITS.loginPerEmail) || isLimited(ipKey, LIMITS.loginPerIp)) {
    redirect("/login?error=locked");
  }

  const user = await db.user.findUnique({ where: { email } });
  // Always run a bcrypt compare so response time doesn't reveal whether the
  // email has an account.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.active || !ok) {
    hit(emailKey, LIMITS.loginPerEmail);
    hit(ipKey, LIMITS.loginPerIp);
    redirect("/login?error=1");
  }

  clearLimit(emailKey);
  // Two-step sign-in: the password was right, now ask for the app's code.
  if (user.totpEnabled && user.totpSecret) {
    await startTwoStep(user.id);
    redirect("/login/verify");
  }
  await createSession(user.id, user.role);
  redirect(landingFor(user));
}

/** Step 2 of sign-in for two-step accounts: the authenticator code or a backup code. */
export async function verifyTwoStep(formData: FormData) {
  const userId = await pendingTwoStep();
  if (!userId) redirect("/login?error=expired");
  const code = String(formData.get("code") ?? "").trim();

  const key = `2fa:user:${userId}`;
  const ipKey = `2fa:ip:${clientIp(await headers())}`;
  if (isLimited(key, LIMITS.twoStepPerUser) || isLimited(ipKey, LIMITS.loginPerIp)) redirect("/login/verify?error=locked");

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.active || !user.totpEnabled || !user.totpSecret) {
    await endTwoStep();
    redirect("/login");
  }

  const step = verifyTotp(user.totpSecret, code, { lastStep: user.totpLastStep });
  const remaining = step === null ? consumeRecoveryCode(user.totpRecovery, code) : null;
  if (step === null && remaining === null) {
    hit(key, LIMITS.twoStepPerUser);
    hit(ipKey, LIMITS.loginPerIp);
    redirect("/login/verify?error=1");
  }

  await db.user.update({
    where: { id: user.id },
    data: step !== null ? { totpLastStep: step } : { totpRecovery: remaining },
  });
  clearLimit(key);
  await endTwoStep();
  await createSession(user.id, user.role);
  if (user.mustChangePassword) redirect("/settings?first=1");
  // Signed in with a backup code — show how many are left.
  redirect(step === null ? `/settings?recovery=${recoveryCodesLeft(remaining)}` : landingFor(user));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

/**
 * Step 1 of self-service reset: emails a 6-digit one-time code to the account.
 * Always advances to the code step regardless of whether the email exists, so
 * the form can't be used to discover which emails have accounts.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  const ipKey = `reset:req:${clientIp(await headers())}`;
  if (isLimited(ipKey, LIMITS.resetRequestPerIp)) {
    redirect(`/forgot?step=code&email=${encodeURIComponent(email)}&error=throttled`);
  }
  hit(ipKey, LIMITS.resetRequestPerIp);

  if (email) {
    const user = await db.user.findUnique({ where: { email } });
    if (user && user.active) {
      const existing = await db.passwordReset.findUnique({ where: { userId: user.id } });
      const windowLive = existing != null && existing.expiresAt > new Date();

      // Cap codes per active window — stops email-bombing and closes the
      // brute-force gap where resending reset the wrong-guess counter each time.
      if (windowLive && existing!.sends >= OTP_MAX_SENDS) {
        redirect(`/forgot?step=code&email=${encodeURIComponent(email)}&error=throttled`);
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const codeHash = await bcrypt.hash(code, 10);
      const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000);

      if (windowLive) {
        // Same window: new code, reset guesses, count this send toward the cap.
        await db.passwordReset.update({
          where: { userId: user.id },
          data: { codeHash, expiresAt, attempts: 0, sends: { increment: 1 } },
        });
      } else {
        // Fresh window (none existing, or the previous one expired).
        await db.passwordReset.upsert({
          where: { userId: user.id },
          create: { userId: user.id, codeHash, expiresAt, attempts: 0, sends: 1 },
          update: { codeHash, expiresAt, attempts: 0, sends: 1, createdAt: new Date() },
        });
      }
      notifyPasswordOtp({ to: user.email, name: user.name, code });
    }
  }

  redirect(`/forgot?step=code&email=${encodeURIComponent(email)}`);
}

/** Step 2: verifies the code and sets the user's chosen new password. */
export async function resetPasswordWithOtp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const failUrl = (err: string) =>
    `/forgot?step=code&email=${encodeURIComponent(email)}&error=${err}`;

  const ipKey = `reset:verify:${clientIp(await headers())}`;
  if (isLimited(ipKey, LIMITS.resetVerifyPerIp)) redirect(failUrl("throttled"));
  if (!isStrongPassword(password)) redirect(failUrl("weak"));

  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  const reset = user ? await db.passwordReset.findUnique({ where: { userId: user.id } }) : null;
  if (!user || !user.active || !reset) {
    hit(ipKey, LIMITS.resetVerifyPerIp);
    redirect(failUrl("invalid"));
  }

  if (reset.expiresAt < new Date()) {
    await db.passwordReset.delete({ where: { userId: user.id } });
    redirect(failUrl("expired"));
  }
  if (reset.attempts >= OTP_MAX_ATTEMPTS) {
    await db.passwordReset.delete({ where: { userId: user.id } });
    redirect(failUrl("attempts"));
  }

  if (!(await bcrypt.compare(code, reset.codeHash))) {
    hit(ipKey, LIMITS.resetVerifyPerIp);
    await db.passwordReset.update({
      where: { userId: user.id },
      data: { attempts: { increment: 1 } },
    });
    redirect(failUrl("code"));
  }

  // Valid — set the new password (chosen by the user, so no forced change).
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: false },
  });
  await db.passwordReset.delete({ where: { userId: user.id } });
  redirect("/login?reset=1");
}

export async function changeOwnPassword(formData: FormData) {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");

  if (!isStrongPassword(next)) redirect("/settings?error=weak");
  // On a forced first-time change the user just authenticated with their
  // admin-issued password, so don't make them re-enter it. Only verify the
  // current password for a normal, voluntary change.
  if (!user.mustChangePassword) {
    if (!(await bcrypt.compare(current, user.passwordHash))) {
      redirect("/settings?error=wrong");
    }
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false },
  });
  redirect("/settings?ok=1");
}

export async function updateOwnProfile(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const jobTitle = String(formData.get("jobTitle") ?? "").trim();
  const preferredLanguageRaw = String(formData.get("preferredLanguage") ?? "");
  const preferredLanguage = CHAT_LANGUAGES.some((l) => l.value === preferredLanguageRaw)
    ? preferredLanguageRaw
    : null;
  if (name) {
    await db.user.update({
      where: { id: user.id },
      data: { name, jobTitle: jobTitle || null, preferredLanguage },
    });
  }
  redirect("/settings?ok=1");
}

export async function updateNotificationPrefs(formData: FormData) {
  const user = await requireUser();
  const emailNotifications = formData.get("emailNotifications") === "on";
  const dailyDigest = formData.get("dailyDigest") === "on";
  await db.user.update({
    where: { id: user.id },
    data: { emailNotifications, dailyDigest },
  });
  redirect("/settings?ok=1");
}
