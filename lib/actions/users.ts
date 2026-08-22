"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { notifyUserWelcome, notifyPasswordReset } from "@/lib/mail";
import { isStrongPassword } from "@/lib/password";
import { USER_DATA_COUNT_SELECT, userHasData } from "@/lib/userData";

const ROLES = ["ADMIN", "MANAGER", "EMPLOYEE"];

/**
 * Where to send the admin after an action. Defaults to the Users list, but a
 * form may pass a `redirectTo` internal path (e.g. a person's profile) to stay
 * in place. The status query (?updated=1 etc.) from the fallback is preserved.
 */
function returnTo(formData: FormData, fallbackWithQuery: string): string {
  const to = String(formData.get("redirectTo") ?? "");
  if (!to.startsWith("/") || to.startsWith("//")) return fallbackWithQuery;
  const q = fallbackWithQuery.includes("?") ? `?${fallbackWithQuery.split("?")[1]}` : "";
  return `${to}${q}`;
}

export async function createUser(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "EMPLOYEE");
  const companyId = Number(formData.get("companyId"));
  const departmentId = formData.get("departmentId")
    ? Number(formData.get("departmentId"))
    : null;
  const jobTitle = String(formData.get("jobTitle") ?? "").trim();
  const requiresApproval = formData.get("requiresApproval") === "on";

  if (!email || !name || !ROLES.includes(role) || !companyId) {
    redirect("/users?error=invalid");
  }
  if (!isStrongPassword(password)) redirect("/users?error=weak");
  if (await db.user.findUnique({ where: { email } })) {
    redirect("/users?error=exists");
  }

  await db.user.create({
    data: {
      email,
      name,
      role,
      companyId,
      departmentId: departmentId || null,
      jobTitle: jobTitle || null,
      requiresApproval,
      passwordHash: await bcrypt.hash(password, 10),
      mustChangePassword: true,
    },
  });

  notifyUserWelcome({ to: email, name, password });

  revalidatePath("/users");
  redirect("/users?created=1");
}

export async function updateUser(formData: FormData) {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "EMPLOYEE");
  const companyId = Number(formData.get("companyId"));
  const departmentId = formData.get("departmentId")
    ? Number(formData.get("departmentId"))
    : null;
  const jobTitle = String(formData.get("jobTitle") ?? "").trim();
  const requiresApproval = formData.get("requiresApproval") === "on";

  if (!id || !name || !email || !ROLES.includes(role) || !companyId) redirect(returnTo(formData, "/users?error=invalid"));
  // An admin cannot demote themselves — prevents locking everyone out.
  if (id === admin.id && role !== "ADMIN") redirect(returnTo(formData, "/users?error=self"));
  // Email must stay unique — allow keeping the current one, block collisions.
  const clash = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (clash && clash.id !== id) redirect(returnTo(formData, `/users?error=exists&edit=${id}`));

  await db.user.update({
    where: { id },
    data: {
      name,
      email,
      role,
      companyId,
      departmentId: departmentId || null,
      jobTitle: jobTitle || null,
      requiresApproval,
    },
  });
  revalidatePath("/users");
  revalidatePath(`/people/${id}`);
  redirect(returnTo(formData, "/users?updated=1"));
}

/**
 * Permanently delete a user — only allowed for an account that was created by
 * mistake: it has never logged in and owns no data. Anything with history must
 * be Deactivated instead (toggleUserActive), which keeps its records.
 */
export async function deleteUser(formData: FormData) {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  if (!id || id === admin.id) redirect(returnTo(formData, "/users?error=self"));

  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, lastSeenAt: true, _count: { select: USER_DATA_COUNT_SELECT } },
  });
  if (!user) redirect("/users?error=invalid");
  // Re-check the safety gate server-side (never trust the button being shown).
  if (user.lastSeenAt || userHasData(user._count)) redirect(returnTo(formData, `/users?error=notempty&edit=${id}`));

  await db.user.delete({ where: { id } });
  revalidatePath("/users");
  // The profile no longer exists — always land on the Users list.
  redirect("/users?deleted=1");
}

export async function resetUserPassword(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (!id) redirect(returnTo(formData, "/users?error=invalid"));
  if (!isStrongPassword(password)) redirect(returnTo(formData, "/users?error=weak"));

  const user = await db.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true },
  });

  notifyPasswordReset({ to: user.email, name: user.name, password });

  revalidatePath("/users");
  redirect(returnTo(formData, "/users?reset=1"));
}

export async function toggleUserActive(formData: FormData) {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  if (!id || id === admin.id) redirect(returnTo(formData, "/users?error=self"));

  const user = await db.user.findUnique({ where: { id } });
  if (user) {
    await db.user.update({ where: { id }, data: { active: !user.active } });
  }
  revalidatePath("/users");
  revalidatePath(`/people/${id}`);
  redirect(returnTo(formData, "/users"));
}
