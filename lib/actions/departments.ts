"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function createDepartment(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const companyId = Number(formData.get("companyId"));
  if (!name || !companyId) redirect("/departments?error=invalid");

  const exists = await db.department.findUnique({
    where: { name_companyId: { name, companyId } },
  });
  if (exists) redirect("/departments?error=exists");

  await db.department.create({ data: { name, companyId } });
  revalidatePath("/departments");
  redirect("/departments");
}

export async function deleteDepartment(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));

  const usersInDept = await db.user.count({ where: { departmentId: id } });
  if (usersInDept > 0) redirect("/departments?error=inuse");

  await db.department.delete({ where: { id } });
  revalidatePath("/departments");
  redirect("/departments");
}
