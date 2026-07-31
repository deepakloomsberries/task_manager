"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { notifyAssignment, notifyComment, notifyReminder, pushNotification, logActivity } from "@/lib/notify";
import { fmtDate, lookup, TASK_STATUSES } from "@/lib/ui";

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

/**
 * Editing task details and deleting a task belong to the person who assigned
 * it — i.e. the task's creator — plus managers and admins.
 */
function canEditTask(
  user: { id: number; role: string },
  task: { createdById: number }
) {
  return isManagerOrAdmin(user.role) || task.createdById === user.id;
}

/**
 * Progressing a task (moving its status / ticking it done) is also open to the
 * assignee, since they are the one actually working on it.
 */
function canChangeStatus(
  user: { id: number; role: string },
  task: { createdById: number; assigneeId: number | null }
) {
  return canEditTask(user, task) || task.assigneeId === user.id;
}

async function revalidateTaskViews(taskId?: number) {
  revalidatePath("/tasks");
  revalidatePath("/my-tasks");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  revalidatePath("/trash");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const data = parseTaskForm(formData);
  if (!data.title || !PRIORITIES.includes(data.priority)) redirect("/tasks?error=invalid");

  const task = await db.task.create({ data: { ...data, createdById: user.id } });
  await logActivity(task.id, user.id, "created");

  if (task.assigneeId) {
    const assignee = await db.user.findUnique({ where: { id: task.assigneeId } });
    if (assignee) await notifyAssignment({ assignee, task, actor: user });
  }

  await revalidateTaskViews(task.id);
  redirect(`/tasks/${task.id}`);
}

export async function addSubtask(formData: FormData) {
  const user = await requireUser();
  const parentId = Number(formData.get("parentId"));
  const title = String(formData.get("title") ?? "").trim();
  const assigneeId = formData.get("assigneeId") ? Number(formData.get("assigneeId")) : null;

  const parent = await db.task.findUnique({ where: { id: parentId } });
  if (!parent || parent.deletedAt || !title) redirect(`/tasks/${parentId}`);
  // The task's owner, its assignee, or a manager/admin can break it down.
  if (!canChangeStatus(user, parent)) redirect(`/tasks/${parentId}?error=forbidden`);
  // A subtask must always be assigned to someone.
  if (!assigneeId) redirect(`/tasks/${parentId}?error=subtask-assignee`);

  const task = await db.task.create({
    data: {
      title,
      parentId,
      assigneeId,
      projectId: parent.projectId,
      priority: parent.priority,
      createdById: user.id,
    },
  });
  await logActivity(parentId, user.id, "details", `added subtask "${title}"`);

  if (assigneeId) {
    const assignee = await db.user.findUnique({ where: { id: assigneeId } });
    if (assignee) await notifyAssignment({ assignee, task, actor: user });
  }

  await revalidateTaskViews(parentId);
  redirect(`/tasks/${parentId}`);
}

export async function updateTask(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const task = await db.task.findUnique({ where: { id } });
  if (!task) redirect("/tasks");
  if (!canEditTask(user, task)) redirect(`/tasks/${id}?error=forbidden`);

  const data = parseTaskForm(formData);
  if (!data.title || !PRIORITIES.includes(data.priority)) redirect(`/tasks/${id}?error=invalid`);

  const updated = await db.task.update({ where: { id }, data });

  if (updated.assigneeId !== task.assigneeId) {
    const name = updated.assigneeId
      ? (await db.user.findUnique({ where: { id: updated.assigneeId } }))?.name
      : "unassigned";
    await logActivity(id, user.id, "assignee", `assigned to ${name ?? "unknown"}`);
    if (updated.assigneeId) {
      const assignee = await db.user.findUnique({ where: { id: updated.assigneeId } });
      if (assignee) await notifyAssignment({ assignee, task: updated, actor: user });
    }
  }
  if (String(updated.dueDate) !== String(task.dueDate)) {
    await logActivity(id, user.id, "due", `due date set to ${fmtDate(updated.dueDate)}`);
  }
  if (updated.priority !== task.priority) {
    await logActivity(id, user.id, "priority", `priority set to ${updated.priority}`);
  }
  if (updated.title !== task.title || updated.description !== task.description) {
    await logActivity(id, user.id, "details", "updated title or description");
  }

  await revalidateTaskViews(id);
  redirect(`/tasks/${id}`);
}

/** True when the task still has at least one unfinished blocker. */
async function hasOpenBlockers(taskId: number) {
  const open = await db.taskDependency.count({
    where: { taskId, blocker: { status: { not: "DONE" }, deletedAt: null } },
  });
  return open > 0;
}

async function changeStatus(
  user: { id: number; name: string; role: string },
  taskId: number,
  status: string
): Promise<"ok" | "noop" | "blocked"> {
  if (!STATUSES.includes(status)) return "noop";
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.deletedAt || !canChangeStatus(user, task)) return "noop";
  if (task.status === status) return "noop";

  // Can't complete a task while something it depends on is still open.
  if (status === "DONE" && (await hasOpenBlockers(taskId))) return "blocked";

  await db.task.update({
    where: { id: taskId },
    data: { status, completedAt: status === "DONE" ? new Date() : null },
  });
  const from = lookup(TASK_STATUSES, task.status).label;
  const to = lookup(TASK_STATUSES, status).label;
  await logActivity(taskId, user.id, "status", `${from} → ${to}`);

  // Tell the task creator when someone else completes their task.
  if (status === "DONE" && task.createdById !== user.id) {
    await pushNotification(
      task.createdById,
      `${user.name} completed: ${task.title}`,
      `/tasks/${taskId}`
    );
  }
  return "ok";
}

export async function setTaskStatus(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  const back = String(formData.get("back") ?? `/tasks/${id}`);

  const result = await changeStatus(user, id, status);
  await revalidateTaskViews(id);
  if (result === "blocked") {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=blocked`);
  }
  redirect(back);
}

/**
 * Called from the board view when a card is dropped on a column. On the board,
 * only the person the task is assigned to (or a manager/admin) may move it.
 */
export async function moveTask(taskId: number, status: string) {
  const user = await requireUser();
  if (!STATUSES.includes(status)) return;
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.deletedAt) return;
  if (task.assigneeId !== user.id && !isManagerOrAdmin(user.role)) return;
  if (task.status === status) return;

  await changeStatus(user, taskId, status);
  await revalidateTaskViews(taskId);
}

export async function deleteTask(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const task = await db.task.findUnique({ where: { id } });
  if (!task) redirect("/tasks");

  if (!canEditTask(user, task)) {
    redirect(`/tasks/${id}?error=forbidden`);
  }

  // Soft delete: move the task (and its subtasks) to the recycle bin so it can
  // be recovered later instead of being lost permanently.
  const now = new Date();
  await db.task.updateMany({
    where: { OR: [{ id }, { parentId: id }] },
    data: { deletedAt: now },
  });
  await revalidateTaskViews();
  redirect(task.parentId ? `/tasks/${task.parentId}` : "/tasks");
}

/** Restore a soft-deleted task (and its subtasks) from the recycle bin. */
export async function restoreTask(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const task = await db.task.findUnique({ where: { id } });
  if (!task) redirect("/trash");
  if (!canEditTask(user, task)) redirect("/trash?error=forbidden");

  await db.task.updateMany({
    where: { OR: [{ id }, { parentId: id }] },
    data: { deletedAt: null },
  });
  await revalidateTaskViews(id);
  redirect("/trash");
}

/** Permanently remove a soft-deleted task from the recycle bin. */
export async function purgeTask(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const task = await db.task.findUnique({ where: { id } });
  if (!task) redirect("/trash");
  if (!canEditTask(user, task)) redirect("/trash?error=forbidden");

  await db.task.delete({ where: { id } });
  await revalidateTaskViews();
  redirect("/trash");
}

/**
 * Lets the task creator (or a manager/admin) nudge the assignee with a reminder
 * email and an in-app notification about the task.
 */
export async function sendTaskReminder(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const task = await db.task.findUnique({
    where: { id },
    include: { assignee: true },
  });
  if (!task || task.deletedAt) redirect("/tasks");
  // Only the task's owner — the person who created/assigned it — can nudge the
  // assignee. For a subtask that is its own creator.
  if (task.createdById !== user.id) redirect(`/tasks/${id}?error=forbidden`);
  if (!task.assignee) redirect(`/tasks/${id}?error=no-assignee`);

  await notifyReminder({ recipient: task.assignee, task, actor: user });
  await logActivity(id, user.id, "reminder", `sent a reminder to ${task.assignee.name}`);
  await revalidateTaskViews(id);
  redirect(`/tasks/${id}?ok=reminder`);
}

export async function addComment(formData: FormData) {
  const user = await requireUser();
  const taskId = Number(formData.get("taskId"));
  const body = String(formData.get("body") ?? "").trim();
  if (!taskId || !body) redirect(`/tasks/${taskId}`);

  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { assignee: true, createdBy: true },
  });
  if (!task) redirect("/tasks");

  await db.taskComment.create({ data: { taskId, body, authorId: user.id } });

  // Notify the assignee and the task creator, except whoever wrote the comment.
  const recipients = new Map<number, { id: number; email: string; name: string }>();
  if (task.assignee?.active) recipients.set(task.assignee.id, task.assignee);
  if (task.createdBy.active) recipients.set(task.createdBy.id, task.createdBy);
  recipients.delete(user.id);

  await notifyComment({
    recipients: Array.from(recipients.values()),
    task,
    actor: user,
    comment: body,
  });

  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

// --- Task dependencies (blockers) ------------------------------------------

/** Marks `taskId` as blocked by `blockerId` (blocker must finish first). */
export async function addTaskDependency(formData: FormData) {
  const user = await requireUser();
  const taskId = Number(formData.get("taskId"));
  const blockerId = Number(formData.get("blockerId"));
  if (!taskId || !blockerId) redirect(`/tasks/${taskId || ""}`);
  if (taskId === blockerId) redirect(`/tasks/${taskId}?error=self-block`);

  const [task, blocker] = await Promise.all([
    db.task.findFirst({ where: { id: taskId, deletedAt: null } }),
    db.task.findFirst({ where: { id: blockerId, deletedAt: null } }),
  ]);
  if (!task || !blocker) redirect(`/tasks/${taskId}`);
  if (!canEditTask(user, task)) redirect(`/tasks/${taskId}?error=forbidden`);

  // Reject a direct cycle: A can't be blocked by B if A already blocks B.
  const reverse = await db.taskDependency.findUnique({
    where: { taskId_blockerId: { taskId: blockerId, blockerId: taskId } },
  });
  if (reverse) redirect(`/tasks/${taskId}?error=cycle`);

  await db.taskDependency.upsert({
    where: { taskId_blockerId: { taskId, blockerId } },
    create: { taskId, blockerId },
    update: {},
  });
  await logActivity(taskId, user.id, "details", `added blocker "${blocker.title}"`);
  await revalidateTaskViews(taskId);
  revalidatePath(`/tasks/${blockerId}`);
  redirect(`/tasks/${taskId}`);
}

/** Removes a blocker relationship from `taskId`. */
export async function removeTaskDependency(formData: FormData) {
  const user = await requireUser();
  const taskId = Number(formData.get("taskId"));
  const blockerId = Number(formData.get("blockerId"));
  if (!taskId || !blockerId) redirect(`/tasks/${taskId || ""}`);

  const task = await db.task.findFirst({ where: { id: taskId } });
  if (!task) redirect("/tasks");
  if (!canEditTask(user, task)) redirect(`/tasks/${taskId}?error=forbidden`);

  await db.taskDependency.deleteMany({ where: { taskId, blockerId } });
  await revalidateTaskViews(taskId);
  revalidatePath(`/tasks/${blockerId}`);
  redirect(`/tasks/${taskId}`);
}
