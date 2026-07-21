"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";

const STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function parseTaskForm(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    priority: String(formData.get("priority") ?? "MEDIUM"),
    projectId: formData.get("projectId") ? Number(formData.get("projectId")) : null,
    assigneeId: formData.get("assigneeId") ? Number(formData.get("assigneeId")) : null,
    dueDate: formData.get("dueDate") ? new Date(String(formData.get("dueDate"))) : null,
  };
}

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const data = parseTaskForm(formData);
  if (!data.title || !PRIORITIES.includes(data.priority)) redirect("/tasks?error=invalid");

  const task = await db.task.create({
    data: { ...data, createdById: user.id },
  });
  revalidatePath("/tasks");
  redirect(`/tasks/${task.id}`);
}

export async function updateTask(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const task = await db.task.findUnique({ where: { id } });
  if (!task) redirect("/tasks");

  const canEdit =
    isManagerOrAdmin(user.role) || task.createdById === user.id || task.assigneeId === user.id;
  if (!canEdit) redirect(`/tasks/${id}?error=forbidden`);

  const data = parseTaskForm(formData);
  if (!data.title || !PRIORITIES.includes(data.priority)) redirect(`/tasks/${id}?error=invalid`);

  await db.task.update({ where: { id }, data });
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
  redirect(`/tasks/${id}`);
}

export async function setTaskStatus(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  const back = String(formData.get("back") ?? `/tasks/${id}`);
  if (!STATUSES.includes(status)) redirect(back);

  const task = await db.task.findUnique({ where: { id } });
  if (!task) redirect("/tasks");

  const canEdit =
    isManagerOrAdmin(user.role) || task.createdById === user.id || task.assigneeId === user.id;
  if (!canEdit) redirect(back);

  await db.task.update({
    where: { id },
    data: {
      status,
      completedAt: status === "DONE" ? new Date() : null,
    },
  });
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${id}`);
  revalidatePath("/dashboard");
  redirect(back);
}

export async function deleteTask(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const task = await db.task.findUnique({ where: { id } });
  if (!task) redirect("/tasks");

  if (!isManagerOrAdmin(user.role) && task.createdById !== user.id) {
    redirect(`/tasks/${id}?error=forbidden`);
  }

  await db.task.delete({ where: { id } });
  revalidatePath("/tasks");
  redirect("/tasks");
}

export async function addComment(formData: FormData) {
  const user = await requireUser();
  const taskId = Number(formData.get("taskId"));
  const body = String(formData.get("body") ?? "").trim();
  if (!taskId || !body) redirect(`/tasks/${taskId}`);

  await db.taskComment.create({ data: { taskId, body, authorId: user.id } });
  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}
