"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { notifyUserWelcome, notifyPasswordReset } from "@/lib/mail";
import { isStrongPassword } from "@/lib/password";

const ROLES = ["ADMIN", "MANAGER", "EMPLOYEE"];

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
  const role = String(formData.get("role") ?? "EMPLOYEE");
  const companyId = Number(formData.get("companyId"));
  const departmentId = formData.get("departmentId")
    ? Number(formData.get("departmentId"))
    : null;
  const jobTitle = String(formData.get("jobTitle") ?? "").trim();
  const requiresApproval = formData.get("requiresApproval") === "on";

  if (!id || !name || !ROLES.includes(role) || !companyId) redirect("/users?error=invalid");
  // An admin cannot demote themselves — prevents locking everyone out.
  if (id === admin.id && role !== "ADMIN") redirect("/users?error=self");

  await db.user.update({
    where: { id },
    data: {
      name,
      role,
      companyId,
      departmentId: departmentId || null,
      jobTitle: jobTitle || null,
      requiresApproval,
    },
  });
  revalidatePath("/users");
  redirect("/users?updated=1");
}

export async function resetUserPassword(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (!id) redirect("/users?error=invalid");
  if (!isStrongPassword(password)) redirect("/users?error=weak");

  const user = await db.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true },
  });

  notifyPasswordReset({ to: user.email, name: user.name, password });

  revalidatePath("/users");
  redirect("/users?reset=1");
}

export async function toggleUserActive(formData: FormData) {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  if (!id || id === admin.id) redirect("/users?error=self");

  const user = await db.user.findUnique({ where: { id } });
  if (user) {
    await db.user.update({ where: { id }, data: { active: !user.active } });
  }
  revalidatePath("/users");
  redirect("/users");
}
