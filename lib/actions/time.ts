"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { pushNotification, logActivity } from "@/lib/notify";
import { parseHours } from "@/lib/ui";
import { weekStartOf } from "@/lib/timerange";

/** Whether a user's week has been submitted/approved and is therefore locked. */
async function weekLocked(userId: number, date: Date | string) {
  const weekStart = weekStartOf(date);
  const sub = await db.timesheetSubmission.findUnique({
    where: { userId_weekStart: { userId, weekStart } },
  });
  return !!sub && (sub.status === "SUBMITTED" || sub.status === "APPROVED");
}

/**
 * Resolves the hours and optional precise window from the form. A person can
 * either type hours directly, or give a start + end time (HH:MM) on the date —
 * in which case the hours are derived and the window is recorded.
 */
function resolveWindow(formData: FormData, date: string): {
  hours: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
} {
  const start = String(formData.get("start") ?? "").trim();
  const end = String(formData.get("end") ?? "").trim();
  const ok = /^\d{2}:\d{2}$/;
  if (date && ok.test(start) && ok.test(end)) {
    const startedAt = new Date(`${date}T${start}:00`);
    const endedAt = new Date(`${date}T${end}:00`);
    if (!isNaN(startedAt.getTime()) && !isNaN(endedAt.getTime()) && endedAt > startedAt) {
      const hours = Math.round(((endedAt.getTime() - startedAt.getTime()) / 3600000) * 60) / 60;
      return { hours, startedAt, endedAt };
    }
    return { hours: null, startedAt: null, endedAt: null }; // bad range → invalid
  }
  return { hours: parseHours(String(formData.get("hours") ?? "")), startedAt: null, endedAt: null };
}

export async function createTimeEntry(formData: FormData) {
  const user = await requireUser();
  const date = String(formData.get("date") ?? "");
  const { hours, startedAt, endedAt } = resolveWindow(formData, date);
  const taskId = formData.get("taskId") ? Number(formData.get("taskId")) : null;
  const projectId = formData.get("projectId") ? Number(formData.get("projectId")) : null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!date || hours === null || hours <= 0 || hours > 24) redirect("/timesheet?error=invalid");
  if (await weekLocked(user.id, date)) {
    redirect(`${backFrom(formData)}${backFrom(formData).includes("?") ? "&" : "?"}error=locked`);
  }

  await db.timeEntry.create({
    data: { userId: user.id, date: new Date(date), hours, startedAt, endedAt, taskId, projectId, note },
  });
  revalidatePath("/timesheet");
  redirect(backFrom(formData));
}

/** Where to return after a timesheet action — preserves the active range view. */
function backFrom(formData: FormData) {
  const back = String(formData.get("back") ?? "").trim();
  return back.startsWith("/timesheet") ? back : "/timesheet";
}

export async function updateTimeEntry(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const date = String(formData.get("date") ?? "");
  const { hours, startedAt, endedAt } = resolveWindow(formData, date);
  const taskId = formData.get("taskId") ? Number(formData.get("taskId")) : null;
  const projectId = formData.get("projectId") ? Number(formData.get("projectId")) : null;
  const note = String(formData.get("note") ?? "").trim() || null;

  const back = backFrom(formData);
  const sep = back.includes("?") ? "&" : "?";
  if (!id || !date || hours === null || hours <= 0 || hours > 24) {
    redirect(`${back}${sep}error=invalid`);
  }

  // Scope the update to the caller's own entries so nobody can edit another
  // person's timesheet, and block edits to a locked (submitted) week.
  const existing = await db.timeEntry.findFirst({ where: { id, userId: user.id } });
  if (!existing) redirect(back);
  if ((await weekLocked(user.id, existing.date)) || (await weekLocked(user.id, date))) {
    redirect(`${back}${sep}error=locked`);
  }

  await db.timeEntry.update({
    where: { id },
    data: { date: new Date(date), hours, startedAt, endedAt, taskId, projectId, note },
  });
  revalidatePath("/timesheet");
  redirect(back);
}

export async function deleteTimeEntry(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const back = backFrom(formData);
  const entry = await db.timeEntry.findFirst({ where: { id, userId: user.id } });
  if (entry && (await weekLocked(user.id, entry.date))) {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=locked`);
  }
  await db.timeEntry.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/timesheet");
  redirect(back);
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
        startedAt: new Date(timer.startedAt),
        endedAt: new Date(),
        note: timer.note,
        source: "timer",
      },
    }),
    db.taskTimer.delete({ where: { id: timer.id } }),
  ]);
  return hours;
}

/**
 * Stops every running timer on a task and banks the elapsed time. Called when a
 * task is completed, so nobody keeps accruing time against finished work.
 * Returns how many timers were stopped.
 */
export async function commitTimersForTask(taskId: number): Promise<number> {
  const timers = await db.taskTimer.findMany({ where: { taskId } });
  for (const t of timers) await commitTimer(t);
  return timers.length;
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

  // Starting the clock means work has begun, so nudge a fresh task out of the
  // backlog into "In Progress" automatically (only from To-Do — never override
  // Review or Done).
  if (task.status === "TODO") {
    await db.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
    await logActivity(taskId, user.id, "status", "TODO → IN_PROGRESS (timer started)");
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/tasks");
  }

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

// --- Weekly timesheet submit & approve -------------------------------------

/** Employee submits a week's timesheet for manager approval (locks the week). */
export async function submitTimesheet(formData: FormData) {
  const user = await requireUser();
  const weekStart = weekStartOf(String(formData.get("weekStart") ?? ""));
  const back = backFrom(formData);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const agg = await db.timeEntry.aggregate({
    _sum: { hours: true },
    where: { userId: user.id, date: { gte: weekStart, lt: weekEnd } },
  });
  const totalHours = agg._sum.hours ?? 0;

  await db.timesheetSubmission.upsert({
    where: { userId_weekStart: { userId: user.id, weekStart } },
    create: { userId: user.id, weekStart, totalHours, status: "SUBMITTED" },
    // Resubmitting after a rejection clears the previous review.
    update: {
      totalHours,
      status: "SUBMITTED",
      submittedAt: new Date(),
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
    },
  });

  // Let managers know there's something to review.
  const managers = await db.user.findMany({
    where: { active: true, role: { in: ["ADMIN", "MANAGER"] }, id: { not: user.id } },
    select: { id: true },
  });
  const label = weekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  await Promise.all(
    managers.map((m) =>
      pushNotification(m.id, `${user.name} submitted their timesheet for week of ${label}`, "/timesheet/team")
    )
  );

  revalidatePath("/timesheet");
  revalidatePath("/timesheet/team");
  redirect(back);
}

/** Employee withdraws a still-pending submission so they can edit again. */
export async function withdrawTimesheet(formData: FormData) {
  const user = await requireUser();
  const weekStart = weekStartOf(String(formData.get("weekStart") ?? ""));
  const back = backFrom(formData);

  // Only a submission that hasn't been approved yet can be withdrawn.
  await db.timesheetSubmission.deleteMany({
    where: { userId: user.id, weekStart, status: "SUBMITTED" },
  });
  revalidatePath("/timesheet");
  revalidatePath("/timesheet/team");
  redirect(back);
}

/** Manager approves a submitted week (keeps it locked). */
export async function approveTimesheet(formData: FormData) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/timesheet");
  const id = Number(formData.get("id"));
  const back = String(formData.get("back") ?? "/timesheet/team");

  const sub = await db.timesheetSubmission.findUnique({ where: { id } });
  if (sub && sub.status === "SUBMITTED") {
    await db.timesheetSubmission.update({
      where: { id },
      data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date() },
    });
    const label = sub.weekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    await pushNotification(sub.userId, `${user.name} approved your timesheet for week of ${label}`, "/timesheet");
  }
  revalidatePath("/timesheet/team");
  redirect(back);
}

/** Manager approves every pending submission in one click. */
export async function approveAllTimesheets(formData: FormData) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/timesheet");
  const back = String(formData.get("back") ?? "/timesheet/team");

  const pending = await db.timesheetSubmission.findMany({
    where: { status: "SUBMITTED" },
    select: { userId: true, weekStart: true },
  });
  if (pending.length > 0) {
    await db.timesheetSubmission.updateMany({
      where: { status: "SUBMITTED" },
      data: { status: "APPROVED", reviewedById: user.id, reviewedAt: new Date() },
    });
    await Promise.all(
      pending.map((s) => {
        const label = s.weekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
        return pushNotification(
          s.userId,
          `${user.name} approved your timesheet for week of ${label}`,
          "/timesheet"
        );
      })
    );
  }
  revalidatePath("/timesheet/team");
  redirect(back);
}

/** Manager rejects a submission, unlocking the week so the employee can fix it. */
export async function rejectTimesheet(formData: FormData) {
  const user = await requireUser();
  if (!isManagerOrAdmin(user.role)) redirect("/timesheet");
  const id = Number(formData.get("id"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const back = String(formData.get("back") ?? "/timesheet/team");

  const sub = await db.timesheetSubmission.findUnique({ where: { id } });
  if (sub && sub.status === "SUBMITTED") {
    await db.timesheetSubmission.update({
      where: { id },
      data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date(), reviewNote: note },
    });
    const label = sub.weekStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    await pushNotification(
      sub.userId,
      `${user.name} requested changes to your timesheet for week of ${label}`,
      "/timesheet"
    );
  }
  revalidatePath("/timesheet/team");
  redirect(back);
}
