import { db } from "./db";
import { notifyTaskAssigned, notifyTaskComment } from "./mail";

/** Creates an in-app notification. */
export async function pushNotification(userId: number, message: string, link?: string) {
  await db.notification.create({ data: { userId, message, link } });
}

/** In-app notification + email when a task is assigned to someone. */
export async function notifyAssignment(opts: {
  assignee: { id: number; email: string; name: string; active: boolean };
  task: { id: number; title: string; dueDate: Date | null; priority: string };
  actor: { id: number; name: string };
}) {
  if (!opts.assignee.active || opts.assignee.id === opts.actor.id) return;
  await pushNotification(
    opts.assignee.id,
    `${opts.actor.name} assigned you: ${opts.task.title}`,
    `/tasks/${opts.task.id}`
  );
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

/** In-app notification + email to task participants when a comment is added. */
export async function notifyComment(opts: {
  recipients: { id: number; email: string; name: string }[];
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

/** Records an entry in a task's activity history. */
export async function logActivity(
  taskId: number,
  actorId: number,
  type: string,
  detail?: string
) {
  await db.taskActivity.create({ data: { taskId, actorId, type, detail } });
}
