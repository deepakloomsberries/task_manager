import { db } from "./db";
import { notifyTaskAssigned, notifyTaskComment, notifyTaskReminder, notifyReviewRequested } from "./mail";
import { sendPushToUser } from "./push";

/** Creates an in-app notification and fires a matching Web Push (if enabled). */
export async function pushNotification(userId: number, message: string, link?: string) {
  await db.notification.create({ data: { userId, message, link } });
  // Fire-and-forget browser push — a no-op unless VAPID keys are configured.
  void sendPushToUser(userId, {
    title: "Looms & Berries Tasks",
    body: message,
    url: link ?? "/notifications",
  }).catch(() => {});
}

/**
 * Whether a user should receive email. Users can turn email off in Settings
 * while still getting in-app notifications. `emailNotifications` is often
 * already loaded on the user row; when it isn't, we look it up.
 */
async function wantsEmail(user: { id: number; emailNotifications?: boolean }) {
  if (typeof user.emailNotifications === "boolean") return user.emailNotifications;
  const row = await db.user.findUnique({
    where: { id: user.id },
    select: { emailNotifications: true },
  });
  return row?.emailNotifications ?? true;
}

/** In-app notification + email when a task is assigned to someone. */
export async function notifyAssignment(opts: {
  assignee: { id: number; email: string; name: string; active: boolean; emailNotifications?: boolean };
  task: { id: number; title: string; dueDate: Date | null; priority: string };
  actor: { id: number; name: string };
}) {
  if (!opts.assignee.active || opts.assignee.id === opts.actor.id) return;
  await pushNotification(
    opts.assignee.id,
    `${opts.actor.name} assigned you: ${opts.task.title}`,
    `/tasks/${opts.task.id}`
  );
  if (await wantsEmail(opts.assignee)) {
    notifyTaskAssigned({
      to: opts.assignee.email,
      assigneeName: opts.assignee.name,
      taskId: opts.task.id,
      taskTitle: opts.task.title,
      assignedBy: opts.actor.name,
      dueDate: opts.task.dueDate,
      priority: opts.task.priority,
    });
  }
}

/** In-app notification + email to the task owner when work is sent for review. */
export async function notifyReviewNeeded(opts: {
  owner: { id: number; email: string; name: string; active: boolean; emailNotifications?: boolean };
  task: { id: number; title: string };
  actor: { id: number; name: string };
}) {
  if (!opts.owner.active || opts.owner.id === opts.actor.id) return;
  await pushNotification(
    opts.owner.id,
    `${opts.actor.name} sent "${opts.task.title}" for your review`,
    `/tasks/${opts.task.id}`
  );
  if (await wantsEmail(opts.owner)) {
    notifyReviewRequested({
      to: opts.owner.email,
      ownerName: opts.owner.name,
      taskId: opts.task.id,
      taskTitle: opts.task.title,
      sentBy: opts.actor.name,
    });
  }
}

/** In-app notification + email to task participants when a comment is added. */
export async function notifyComment(opts: {
  recipients: { id: number; email: string; name: string; emailNotifications?: boolean }[];
  task: { id: number; title: string };
  actor: { id: number; name: string };
  comment: string;
}) {
  for (const r of opts.recipients) {
    await pushNotification(
      r.id,
      `${opts.actor.name} commented on: ${opts.task.title}`,
      `/tasks/${opts.task.id}`
    );
    if (await wantsEmail(r)) {
      notifyTaskComment({
        to: r.email,
        recipientName: r.name,
        taskId: opts.task.id,
        taskTitle: opts.task.title,
        commenter: opts.actor.name,
        comment: opts.comment,
      });
    }
  }
}

/** In-app notification + email reminding the assignee about a task. */
export async function notifyReminder(opts: {
  recipient: { id: number; email: string; name: string; active: boolean; emailNotifications?: boolean };
  task: { id: number; title: string; dueDate: Date | null; priority: string };
  actor: { id: number; name: string };
}) {
  if (!opts.recipient.active) return;
  await pushNotification(
    opts.recipient.id,
    `${opts.actor.name} sent a reminder: ${opts.task.title}`,
    `/tasks/${opts.task.id}`
  );
  if (await wantsEmail(opts.recipient)) {
    notifyTaskReminder({
      to: opts.recipient.email,
      recipientName: opts.recipient.name,
      taskId: opts.task.id,
      taskTitle: opts.task.title,
      sentBy: opts.actor.name,
      dueDate: opts.task.dueDate,
      priority: opts.task.priority,
    });
  }
}

/** Records an entry in a task's activity history. */
export async function logActivity(
  taskId: number,
  actorId: number,
  type: string,
  detail?: string
) {
  await db.taskActivity.create({ data: { taskId, actorId, type, detail } });
}
