"use server";

import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { hashRecoveryCodes, newRecoveryCodes, newTotpSecret, otpauthUrl, verifyTotp } from "@/lib/totp";

type Result = { ok: true; codes?: string[] } | { ok: false; error: string };

/** Step 1 of setup: a fresh secret and its QR code (not active until confirmed). */
export async function startTwoStepSetup(): Promise<{ secret: string; qr: string } | { error: string }> {
  const user = await requireUser();
  if (user.totpEnabled) return { error: "Two-step sign-in is already on." };
  const secret = newTotpSecret();
  await db.user.update({ where: { id: user.id }, data: { totpSecret: secret, totpLastStep: null } });
  const qr = await QRCode.toString(otpauthUrl(secret, user.email), { type: "svg", margin: 1, width: 200 });
  return { secret, qr };
}

/** Step 2: the first code from the app proves it's set up — switch on and hand out backup codes. */
export async function confirmTwoStepSetup(code: string): Promise<Result> {
  const user = await requireUser();
  if (user.totpEnabled) return { ok: false, error: "Two-step sign-in is already on." };
  if (!user.totpSecret) return { ok: false, error: "Start the setup again." };
  const step = verifyTotp(user.totpSecret, code);
  if (step === null) return { ok: false, error: "That code isn't right — enter the current 6-digit code from the app." };
  const codes = newRecoveryCodes();
  await db.user.update({
    where: { id: user.id },
    data: { totpEnabled: true, totpLastStep: step, totpRecovery: hashRecoveryCodes(codes) },
  });
  revalidatePath("/", "layout");
  return { ok: true, codes };
}

async function checkPassword(userId: number, password: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  return !!u && (await bcrypt.compare(password, u.passwordHash));
}

/** New set of backup codes (the old ones stop working). Needs the password. */
export async function regenerateRecoveryCodes(password: string): Promise<Result> {
  const user = await requireUser();
  if (!user.totpEnabled) return { ok: false, error: "Two-step sign-in is off." };
  if (!(await checkPassword(user.id, password))) return { ok: false, error: "Wrong password." };
  const codes = newRecoveryCodes();
  await db.user.update({ where: { id: user.id }, data: { totpRecovery: hashRecoveryCodes(codes) } });
  return { ok: true, codes };
}

/** Turns two-step sign-in off for yourself. Needs the password. */
export async function disableTwoStep(password: string): Promise<Result> {
  const user = await requireUser();
  if (!(await checkPassword(user.id, password))) return { ok: false, error: "Wrong password." };
  await db.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecret: null, totpLastStep: null, totpRecovery: null },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** An admin turns it off for someone who lost their phone and backup codes. */
export async function adminResetTwoStep(formData: FormData) {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  if (id === admin.id) redirect("/users?error=own2fa");
  await db.user.update({
    where: { id },
    data: { totpEnabled: false, totpSecret: null, totpLastStep: null, totpRecovery: null },
  });
  revalidatePath("/users");
  redirect(`/users?twostep=1&edit=${id}`);
}
