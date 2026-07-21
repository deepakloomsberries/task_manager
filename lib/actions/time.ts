"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function createTimeEntry(formData: FormData) {
  const user = await requireUser();
  const date = String(formData.get("date") ?? "");
  const hours = Number(formData.get("hours"));
  const taskId = formData.get("taskId") ? Number(formData.get("taskId")) : null;
  const projectId = formData.get("projectId") ? Number(formData.get("projectId")) : null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!date || !hours || hours <= 0 || hours > 24) redirect("/timesheet?error=invalid");

  await db.timeEntry.create({
    data: { userId: user.id, date: new Date(date), hours, taskId, projectId, note },
  });
  revalidatePath("/timesheet");
  redirect("/timesheet");
}

export async function deleteTimeEntry(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  await db.timeEntry.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/timesheet");
  redirect("/timesheet");
}
