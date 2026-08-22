"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAdmin } from "@/lib/auth";
import { notifyAssignment, notifyComment, notifyReminder, notifyReviewNeeded, notifyCompletion, notifyApproval, notifyReopened, pushNotification, logActivity } from "@/lib/notify";
import { notifyCollaboratorAdded } from "@/lib/mail";
import { seriesKeyFor } from "@/lib/recurrence";
import { findMentionedIds } from "@/lib/mentions";
import { companyTimezone, zonedStartOfToday } from "@/lib/tz";
import { commitTimersForTask, startTimerFor } from "@/lib/actions/time";
import { fmtDate, lookup, parseHours, TASK_STATUSES } from "@/lib/ui";

const STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const RECURRENCES = ["DAILY", "WEEKLY", "MONTHLY"];

function parseTaskForm(formData: FormData) {
  const recurrenceRaw = String(formData.get("recurrence") ?? "");
  return {
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    priority: String(formData.get("priority") ?? "MEDIUM"),
    projectId: formData.get("projectId") ? Number(formData.get("projectId")) : null,
    assigneeId: formData.get("assigneeId") ? Number(formData.get("assigneeId")) : null,
    startDate: formData.get("startDate") ? new Date(String(formData.get("startDate"))) : null,
    dueDate: formData.get("dueDate") ? new Date(String(formData.get("dueDate"))) : null,
    recurrence: RECURRENCES.includes(recurrenceRaw) ? recurrenceRaw : null,
    estimateHours: parseHours(String(formData.get("estimate") ?? "")),
    reviewRequired: formData.get("reviewRequired") === "on",
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
  task: { createdById: number; assigneeId: number | null; collaborators?: { userId: number }[] }
) {
  return (
    canEditTask(user, task) ||
    task.assigneeId === user.id ||
    (task.collaborators?.some((c) => c.userId === user.id) ?? false)
  );
}

async function revalidateTaskViews(taskId?: number) {
  revalidatePath("/tasks");
  revalidatePath("/my-tasks");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
  revalidatePath("/trash");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

/** Toggle whether the Tasks list shows recurring occurrences (managers/admins). */
export async function setRecurringVisibility(formData: FormData) {
  const show = formData.get("show") === "1";
  cookies().set("showRecurring", show ? "1" : "0", { sameSite: "lax", path: "/" });
  redirect(String(formData.get("back") ?? "/tasks"));
}

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const data = parseTaskForm(formData);
  if (!data.title || !PRIORITIES.includes(data.priority)) redirect("/tasks?error=invalid");

  const task = await db.task.create({
    data: { ...data, seriesId: seriesKeyFor(data), createdById: user.id },
  });
  await logActivity(task.id, user.id, "created");

  if (task.assigneeId) {
    const assignee = await db.user.findUnique({ where: { id: task.assigneeId } });
    if (assignee) await notifyAssignment({ assignee, task, actor: user });
  }

  // Collaborators chosen on the create form — link them and let them know.
  const collabIds = Array.from(
    new Set(
      formData
        .getAll("collaboratorIds")
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n) && n > 0 && n !== task.assigneeId)
    )
  );
  for (const cid of collabIds) {
    await addCollaborator(task.id, cid, task.title, user);
  }

  await revalidateTaskViews(task.id);
  redirect(`/tasks/${task.id}`);
}

/**
 * Links a collaborator to a task (if active and not already the assignee),
 * then notifies them in-app + email. Shared by the create form and the task
 * detail's "add collaborator".
 */
async function addCollaborator(
  taskId: number,
  userId: number,
  taskTitle: string,
  actor: { id: number; name: string }
) {
  const person = await db.user.findUnique({ where: { id: userId } });
  if (!person || !person.active) return;
  await db.taskCollaborator.upsert({
    where: { taskId_userId: { taskId, userId } },
    update: {},
    create: { taskId, userId },
  });
  await logActivity(taskId, actor.id, "details", `added ${person.name} as a collaborator`);
  if (userId !== actor.id) {
    await pushNotification(userId, `${actor.name} added you as a collaborator on: ${taskTitle}`, `/tasks/${taskId}`);
    if (person.emailNotifications) {
      notifyCollaboratorAdded({ to: person.email, name: person.name, taskId, taskTitle, addedBy: actor.name });
    }
  }
}

/**
 * Fast capture from the dashboard: creates a To-Do assigned to the current
 * user, due today in their office's time zone, so it lands straight in their
 * "Due today" list. Returns nothing and does not redirect — the inline widget
 * clears itself and refreshes.
 */
export async function quickAddTask(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title || title.length > 300) return;

  const due = zonedStartOfToday(new Date(), companyTimezone(user.company));
  const task = await db.task.create({
    data: {
      title,
      assigneeId: user.id,
      createdById: user.id,
      status: "TODO",
      priority: "MEDIUM",
      dueDate: due,
    },
  });
  await logActivity(task.id, user.id, "created");
  revalidatePath("/dashboard");
  revalidatePath("/my-tasks");
  revalidatePath("/tasks");
}

/** Creates a copy of a task (fields, tags and collaborators — not history). */
export async function duplicateTask(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const src = await db.task.findUnique({ where: { id }, include: { tags: true, collaborators: true } });
  if (!src || src.deletedAt) redirect("/tasks");
  if (!canEditTask(user, src)) redirect(`/tasks/${id}?error=forbidden`);

  const copy = await db.task.create({
    data: {
      title: `${src.title} (copy)`,
      description: src.description,
      status: "TODO",
      priority: src.priority,
      projectId: src.projectId,
      assigneeId: src.assigneeId,
      startDate: src.startDate,
      dueDate: src.dueDate,
      recurrence: src.recurrence,
      estimateHours: src.estimateHours,
      createdById: user.id,
      tags: { create: src.tags.map((t) => ({ tagId: t.tagId })) },
      collaborators: { create: src.collaborators.map((c) => ({ userId: c.userId })) },
    },
  });
  await logActivity(copy.id, user.id, "created");
  if (copy.assigneeId && copy.assigneeId !== user.id) {
    const assignee = await db.user.findUnique({ where: { id: copy.assigneeId } });
    if (assignee) await notifyAssignment({ assignee, task: copy, actor: user });
  }
  await revalidateTaskViews(copy.id);
  redirect(`/tasks/${copy.id}`);
}

/** Deletes a comment. The author can remove their own; admins can remove any. */
export async function deleteComment(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const comment = await db.taskComment.findUnique({ where: { id } });
  if (!comment) redirect("/tasks");
  if (comment.authorId !== user.id && user.role !== "ADMIN") redirect(`/tasks/${comment.taskId}`);
  await db.taskComment.delete({ where: { id } });
  revalidatePath(`/tasks/${comment.taskId}`);
  redirect(`/tasks/${comment.taskId}`);
}

export async function addSubtask(formData: FormData) {
  const user = await requireUser();
  const parentId = Number(formData.get("parentId"));
  const title = String(formData.get("title") ?? "").trim();
  const assigneeId = formData.get("assigneeId") ? Number(formData.get("assigneeId")) : null;

  const parent = await db.task.findUnique({
    where: { id: parentId },
    include: { collaborators: { select: { userId: true } } },
  });
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
    // New owner hasn't seen it yet — reset the acknowledgement.
    await db.task.update({ where: { id }, data: { acknowledgedAt: null } });
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
  user: { id: number; name: string; role: string; requiresApproval?: boolean },
  taskId: number,
  status: string,
  autoTimer = false
): Promise<"ok" | "noop" | "blocked" | "needs-approval"> {
  if (!STATUSES.includes(status)) return "noop";
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { collaborators: { select: { userId: true } } },
  });
  if (!task || task.deletedAt || !canChangeStatus(user, task)) return "noop";
  if (task.status === status) return "noop";

  // Whether the acting user is the one who actually logs time on this task.
  const isWorker =
    task.assigneeId === user.id || task.collaborators.some((c) => c.userId === user.id);

  if (status === "DONE") {
    // Can't self-complete when the person needs approval or the task itself is
    // flagged review-required — they send it to Review and the owner approves.
    const isOwnerOrManager = isManagerOrAdmin(user.role) || task.createdById === user.id;
    if (!isOwnerOrManager && (user.requiresApproval || task.reviewRequired)) return "needs-approval";
    // Can't complete a task while something it depends on is still open.
    if (await hasOpenBlockers(taskId)) return "blocked";
  }

  await db.task.update({
    where: { id: taskId },
    data: { status, completedAt: status === "DONE" ? new Date() : null },
  });
  const from = lookup(TASK_STATUSES, task.status).label;
  const to = lookup(TASK_STATUSES, status).label;
  await logActivity(taskId, user.id, "status", `${from} → ${to}`);

  // Ping anyone following this task about the status change.
  for (const wid of await watcherIds(taskId, user.id)) {
    await pushNotification(wid, `${task.title}: ${from} → ${to}`, `/tasks/${taskId}`);
  }

  // Work moved backward by someone other than the assignee — tell the assignee.
  // "Sent back" = pulled out of review; "reopened" = a done task made active again.
  const sentBack = task.status === "REVIEW" && (status === "TODO" || status === "IN_PROGRESS");
  const reopened = task.status === "DONE" && status !== "DONE";
  if ((sentBack || reopened) && task.assigneeId && task.assigneeId !== user.id) {
    const assignee = await db.user.findUnique({ where: { id: task.assigneeId } });
    if (assignee) await notifyReopened({ assignee, task, actor: user, newStatus: to, sentBack });
  }

  // Moving your own task to In Progress starts the stopwatch — the mirror of
  // completing it, which stops the timer. Only for the assignee/collaborator
  // actually doing the work (never a manager moving someone else's task), and
  // only from a direct status change (not a bulk move).
  if (status === "IN_PROGRESS" && autoTimer && isWorker) {
    await startTimerFor(user.id, taskId);
    await revalidateTaskViews(taskId);
    revalidatePath("/timesheet");
  }

  // Sent for review → notify the task owner (in-app + email) to approve it.
  if (status === "REVIEW" && task.createdById !== user.id) {
    const owner = await db.user.findUnique({ where: { id: task.createdById } });
    if (owner) await notifyReviewNeeded({ owner, task, actor: user });
  }

  if (status === "DONE") {
    // Stop any running timers on this task and bank their time — a completed
    // task shouldn't keep accruing time for anyone.
    await commitTimersForTask(taskId);

    // Tell the task owner (in-app + email) when someone else completes their task.
    if (task.createdById !== user.id) {
      const owner = await db.user.findUnique({ where: { id: task.createdById } });
      if (owner) await notifyCompletion({ owner, task, actor: user });
    }
    // If this completion approves submitted work (was in Review), tell the assignee.
    if (task.status === "REVIEW" && task.assigneeId && task.assigneeId !== user.id) {
      const assignee = await db.user.findUnique({ where: { id: task.assigneeId } });
      if (assignee) await notifyApproval({ assignee, task, actor: user });
    }
    // Notify assignees of tasks this one was blocking that are now unblocked.
    const dependents = await db.taskDependency.findMany({
      where: { blockerId: taskId },
      include: { task: { select: { id: true, title: true, assigneeId: true, deletedAt: true } } },
    });
    for (const d of dependents) {
      if (!d.task || d.task.deletedAt || !d.task.assigneeId) continue;
      if (d.task.assigneeId === user.id) continue;
      if (await hasOpenBlockers(d.task.id)) continue; // still blocked by something else
      await pushNotification(
        d.task.assigneeId,
        `"${d.task.title}" is unblocked and ready to start`,
        `/tasks/${d.task.id}`
      );
    }

    // Note: recurring tasks no longer spawn their next occurrence here. A
    // nightly job (scripts/recurring.ts) rolls each series forward once per
    // day — archiving the finished/missed instance and creating the new day's
    // copy — so completing early never creates a same-day duplicate.
  }
  return "ok";
}

export async function setTaskStatus(formData: FormData) {
  const user = await requireUser();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status") ?? "");
  const back = String(formData.get("back") ?? `/tasks/${id}`);

  const result = await changeStatus(user, id, status, true);
  await revalidateTaskViews(id);
  if (result === "blocked" || result === "needs-approval") {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${result}`);
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
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: { collaborators: { select: { userId: true } } },
  });
  if (!task || task.deletedAt) return;
  if (!canChangeStatus(user, task)) return;
  if (task.status === status) return;

  await changeStatus(user, taskId, status, true);
  await revalidateTaskViews(taskId);
}

// --- Task collaborators ------------------------------------------------------

/** Owner, assignee, or a manager/admin may manage a task's collaborators. */
function canManageCollaborators(
  user: { id: number; role: string },
  task: { createdById: number; assigneeId: number | null }
) {
  return isManagerOrAdmin(user.role) || task.createdById === user.id || task.assigneeId === user.id;
}

export async function addTaskCollaborator(formData: FormData) {
  const user = await requireUser();
  const taskId = Number(formData.get("taskId"));
  const userId = Number(formData.get("userId"));
  if (!taskId || !userId) redirect(`/tasks/${taskId || ""}`);

  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.deletedAt) redirect("/tasks");
  if (!canManageCollaborators(user, task)) redirect(`/tasks/${taskId}?error=forbidden`);

  // Skip if it's the assignee already; addCollaborator handles inactive users.
  if (userId === task.assigneeId) redirect(`/tasks/${taskId}`);
  await addCollaborator(taskId, userId, task.title, user);
  await revalidateTaskViews(taskId);
  redirect(`/tasks/${taskId}`);
}

export async function removeTaskCollaborator(formData: FormData) {
  const user = await requireUser();
  const taskId = Number(formData.get("taskId"));
  const userId = Number(formData.get("userId"));
  if (!taskId || !userId) redirect(`/tasks/${taskId || ""}`);

  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.deletedAt) redirect("/tasks");
  // A collaborator can remove themselves; otherwise owner/assignee/manager only.
  if (!canManageCollaborators(user, task) && userId !== user.id) {
    redirect(`/tasks/${taskId}?error=forbidden`);
  }

  await db.taskCollaborator.deleteMany({ where: { taskId, userId } });
  const person = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await logActivity(taskId, user.id, "details", `removed ${person?.name ?? "a collaborator"} from collaborators`);
  await revalidateTaskViews(taskId);
  redirect(`/tasks/${taskId}`);
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

/** Follow a task to get notified of status changes and new comments. */
export async function watchTask(formData: FormData) {
  const user = await requireUser();
  const taskId = Number(formData.get("taskId"));
  if (!taskId) redirect("/tasks");
  const task = await db.task.findFirst({ where: { id: taskId, deletedAt: null }, select: { id: true } });
  if (task) {
    await db.taskWatcher.upsert({
      where: { taskId_userId: { taskId, userId: user.id } },
      create: { taskId, userId: user.id },
      update: {},
    });
  }
  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

export async function unwatchTask(formData: FormData) {
  const user = await requireUser();
  const taskId = Number(formData.get("taskId"));
  if (!taskId) redirect("/tasks");
  await db.taskWatcher.deleteMany({ where: { taskId, userId: user.id } });
  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

/** The user ids watching a task, excluding one actor (who triggered the event). */
async function watcherIds(taskId: number, exclude: number): Promise<number[]> {
  const rows = await db.taskWatcher.findMany({ where: { taskId, userId: { not: exclude } }, select: { userId: true } });
  return rows.map((r) => r.userId);
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

  // Resolve any @mentions in the comment against the active directory and ping
  // those people directly — they get a mention notification instead of (not in
  // addition to) the generic "commented" one.
  const directory = await db.user.findMany({ where: { active: true }, select: { id: true, name: true } });
  const mentionedIds = new Set(findMentionedIds(body, directory));
  mentionedIds.delete(user.id);
  for (const id of Array.from(mentionedIds)) {
    await pushNotification(id, `${user.name} mentioned you on: ${task.title}`, `/tasks/${taskId}`);
  }

  // Notify the assignee, the task creator, and anyone watching the task, except
  // whoever wrote the comment and anyone already pinged by name above.
  const recipients = new Map<number, { id: number; email: string; name: string }>();
  if (task.assignee?.active) recipients.set(task.assignee.id, task.assignee);
  if (task.createdBy.active) recipients.set(task.createdBy.id, task.createdBy);
  const watchers = await db.taskWatcher.findMany({
    where: { taskId, user: { active: true } },
    select: { user: { select: { id: true, email: true, name: true } } },
  });
  for (const w of watchers) recipients.set(w.user.id, w.user);
  recipients.delete(user.id);
  for (const id of Array.from(mentionedIds)) recipients.delete(id);

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

/** Moves a task's due date (used by the project timeline's drag-to-reschedule). */
export async function rescheduleTask(taskId: number, dueISO: string | null) {
  const user = await requireUser();
  if (!taskId) return;
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.deletedAt || !canChangeStatus(user, task)) return;

  const due = dueISO ? new Date(dueISO) : null;
  await db.task.update({ where: { id: taskId }, data: { dueDate: due } });
  await logActivity(
    taskId,
    user.id,
    "due",
    due ? `due date set to ${fmtDate(due)}` : "due date cleared"
  );
  await revalidateTaskViews(taskId);
  if (task.projectId) revalidatePath(`/projects/${task.projectId}`);
}

// --- Bulk actions from the task list ---------------------------------------

/**
 * Applies one operation to many selected tasks at once. Each task is checked
 * individually against the caller's permissions, so a bulk action only touches
 * the tasks they're actually allowed to change.
 */
export async function bulkTaskAction(formData: FormData) {
  const user = await requireUser();
  const op = String(formData.get("op") ?? "");
  const value = String(formData.get("value") ?? "").trim();
  const back = String(formData.get("back") ?? "/tasks");
  const ids = String(formData.get("ids") ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);

  for (const id of ids) {
    const task = await db.task.findUnique({
      where: { id },
      include: { collaborators: { select: { userId: true } } },
    });
    if (!task || task.deletedAt) continue;

    if (op === "status") {
      if (STATUSES.includes(value) && canChangeStatus(user, task)) {
        await changeStatus(user, id, value);
      }
      continue;
    }

    // The remaining operations edit task details — owner/manager only.
    if (!canEditTask(user, task)) continue;

    if (op === "assignee") {
      const assigneeId = value ? Number(value) : null;
      await db.task.update({ where: { id }, data: { assigneeId } });
      if (assigneeId && assigneeId !== task.assigneeId) {
        const assignee = await db.user.findUnique({ where: { id: assigneeId } });
        if (assignee) {
          await logActivity(id, user.id, "assignee", `assigned to ${assignee.name}`);
          await notifyAssignment({
            assignee,
            task: { id: task.id, title: task.title, dueDate: task.dueDate, priority: task.priority },
            actor: user,
          });
        }
      }
    } else if (op === "due") {
      const dueDate = value ? new Date(value) : null;
      await db.task.update({ where: { id }, data: { dueDate } });
      await logActivity(id, user.id, "due", dueDate ? `due date set to ${fmtDate(dueDate)}` : "due date cleared");
    } else if (op === "project") {
      const projectId = value ? Number(value) : null;
      await db.task.update({ where: { id }, data: { projectId } });
    } else if (op === "delete") {
      await db.task.updateMany({
        where: { OR: [{ id }, { parentId: id }] },
        data: { deletedAt: new Date() },
      });
    }
  }

  await revalidateTaskViews();
  redirect(back);
}
