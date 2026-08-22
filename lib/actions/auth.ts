"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession, requireUser } from "@/lib/auth";
import { isStrongPassword } from "@/lib/password";
import { notifyPasswordOtp } from "@/lib/mail";

const OTP_TTL_MIN = 15;
const OTP_MAX_ATTEMPTS = 5; // wrong-code guesses before the code is invalidated
const OTP_MAX_SENDS = 5; // codes we'll email within one active window (resend cap)

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    redirect("/login?error=1");
  }

  await createSession(user.id, user.role);
  redirect(user.mustChangePassword ? "/settings?first=1" : "/dashboard");
}

export async function logout() {
  destroySession();
  redirect("/login");
}

/**
 * Step 1 of self-service reset: emails a 6-digit one-time code to the account.
 * Always advances to the code step regardless of whether the email exists, so
 * the form can't be used to discover which emails have accounts.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

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

  if (!isStrongPassword(password)) redirect(failUrl("weak"));

  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  const reset = user ? await db.passwordReset.findUnique({ where: { userId: user.id } }) : null;
  if (!user || !user.active || !reset) redirect(failUrl("invalid"));

  if (reset.expiresAt < new Date()) {
    await db.passwordReset.delete({ where: { userId: user.id } });
    redirect(failUrl("expired"));
  }
  if (reset.attempts >= OTP_MAX_ATTEMPTS) {
    await db.passwordReset.delete({ where: { userId: user.id } });
    redirect(failUrl("attempts"));
  }

  if (!(await bcrypt.compare(code, reset.codeHash))) {
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
  if (name) {
    await db.user.update({
      where: { id: user.id },
      data: { name, jobTitle: jobTitle || null },
    });
  }
  redirect("/settings?ok=1");
}

export async function updateNotificationPrefs(formData: FormData) {
  const user = await requireUser();
  const emailNotifications = formData.get("emailNotifications") === "on";
  await db.user.update({
    where: { id: user.id },
    data: { emailNotifications },
  });
  redirect("/settings?ok=1");
}
