"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseHours } from "@/lib/ui";

export async function createTimeEntry(formData: FormData) {
  const user = await requireUser();
  const date = String(formData.get("date") ?? "");
  const hours = parseHours(String(formData.get("hours") ?? ""));
  const taskId = formData.get("taskId") ? Number(formData.get("taskId")) : null;
  const projectId = formData.get("projectId") ? Number(formData.get("projectId")) : null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!date || hours === null || hours <= 0 || hours > 24) redirect("/timesheet?error=invalid");

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

/** Converts a running timer into a logged time entry. Returns the hours logged. */
async function commitTimer(timer: { id: number; userId: number; taskId: number; note: string | null; startedAt: Date }) {
  const elapsedHours = (Date.now() - new Date(timer.startedAt).getTime()) / 3600000;
  // Round to the nearest minute (1/60h) and never log a zero-length entry.
  const hours = Math.max(0.02, Math.round(elapsedHours * 60) / 60);
  const task = await db.task.findUnique({ where: { id: timer.taskId }, select: { projectId: true } });

  await db.$transaction([
    db.timeEntry.create({
      data: {
        userId: timer.userId,
        taskId: timer.taskId,
        projectId: task?.projectId ?? null,
        date: new Date(timer.startedAt),
        hours,
        note: timer.note,
        source: "timer",
      },
    }),
    db.taskTimer.delete({ where: { id: timer.id } }),
  ]);
  return hours;
}

/**
 * Starts the stopwatch on a task. A person can only time one task at a time, so
 * if they were already timing something else we bank that time first and then
 * switch — the same "what am I working on now" flow as Toggl or Harvest.
 */
export async function startTaskTimer(formData: FormData) {
  const user = await requireUser();
  const taskId = Number(formData.get("taskId"));
  const back = String(formData.get("back") ?? `/tasks/${taskId}`);
  if (!taskId) redirect("/tasks");

  const task = await db.task.findFirst({ where: { id: taskId, deletedAt: null } });
  if (!task) redirect("/tasks");

  const existing = await db.taskTimer.findUnique({ where: { userId: user.id } });
  if (existing) {
    if (existing.taskId === taskId) redirect(back); // already timing this task
    await commitTimer(existing);
  }

  await db.taskTimer.create({ data: { userId: user.id, taskId } });
  revalidatePath(back);
  revalidatePath("/timesheet");
  redirect(back);
}

/** Stops the running timer and logs the elapsed time to the timesheet. */
export async function stopTaskTimer(formData: FormData) {
  const user = await requireUser();
  const back = String(formData.get("back") ?? "/timesheet");
  const timer = await db.taskTimer.findUnique({ where: { userId: user.id } });
  if (timer) await commitTimer(timer);
  revalidatePath(back);
  revalidatePath("/timesheet");
  redirect(back);
}

/** Discards the running timer without logging any time. */
export async function cancelTaskTimer(formData: FormData) {
  const user = await requireUser();
  const back = String(formData.get("back") ?? "/timesheet");
  await db.taskTimer.deleteMany({ where: { userId: user.id } });
  revalidatePath(back);
  redirect(back);
}
