"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession, requireUser } from "@/lib/auth";

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

export async function changeOwnPassword(formData: FormData) {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");

  if (next.length < 8) redirect("/settings?error=short");
  if (!(await bcrypt.compare(current, user.passwordHash))) {
    redirect("/settings?error=wrong");
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
