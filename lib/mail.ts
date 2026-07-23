import nodemailer from "nodemailer";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const APP_NAME = "Looms & Berries Tasks";

function getTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_PORT ?? "465") === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Sends an email in the background. Never throws — a mail failure must not
 * break the action that triggered it. When SMTP is not configured the mail
 * is logged and skipped, so the app works fine without email.
 */
export function sendMail(to: string, subject: string, html: string) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[mail skipped — SMTP not configured] to=${to} subject="${subject}"`);
    return;
  }
  transporter
    .sendMail({
      from: process.env.SMTP_FROM ?? `"${APP_NAME}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    })
    .then(() => console.log(`[mail sent] to=${to} subject="${subject}"`))
    .catch((e) => console.error(`[mail failed] to=${to}:`, e?.message ?? e));
}

function emailShell(title: string, lines: string[], link: string, linkLabel: string) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
    <h2 style="margin:0 0 4px;color:#0f172a">${APP_NAME}</h2>
    <h3 style="margin:16px 0 8px;color:#0369a1">${title}</h3>
    ${lines.map((l) => `<p style="margin:4px 0;color:#334155;font-size:14px">${l}</p>`).join("")}
    <p style="margin:20px 0 0">
      <a href="${link}" style="background:#0284c7;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">${linkLabel}</a>
    </p>
  </div>`;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function notifyTaskAssigned(opts: {
  to: string;
  assigneeName: string;
  taskId: number;
  taskTitle: string;
  assignedBy: string;
  dueDate: Date | null;
  priority: string;
}) {
  const lines = [
    `Hi ${esc(opts.assigneeName)},`,
    `<b>${esc(opts.assignedBy)}</b> assigned you the task: <b>${esc(opts.taskTitle)}</b>`,
    `Priority: ${opts.priority}${
      opts.dueDate ? ` · Due: ${new Date(opts.dueDate).toLocaleDateString("en-GB")}` : ""
    }`,
  ];
  sendMail(
    opts.to,
    `New task assigned: ${opts.taskTitle}`,
    emailShell("You have a new task", lines, `${APP_URL}/tasks/${opts.taskId}`, "Open task")
  );
}

export function notifyTaskReminder(opts: {
  to: string;
  recipientName: string;
  taskId: number;
  taskTitle: string;
  sentBy: string;
  dueDate: Date | null;
  priority: string;
}) {
  const lines = [
    `Hi ${esc(opts.recipientName)},`,
    `<b>${esc(opts.sentBy)}</b> sent you a reminder about the task: <b>${esc(opts.taskTitle)}</b>`,
    `Priority: ${opts.priority}${
      opts.dueDate ? ` · Due: ${new Date(opts.dueDate).toLocaleDateString("en-GB")}` : ""
    }`,
  ];
  sendMail(
    opts.to,
    `Reminder: ${opts.taskTitle}`,
    emailShell("Task reminder", lines, `${APP_URL}/tasks/${opts.taskId}`, "Open task")
  );
}

export function notifyUserWelcome(opts: {
  to: string;
  name: string;
  password: string;
}) {
  const lines = [
    `Hi ${esc(opts.name)},`,
    `An account has been created for you on <b>${APP_NAME}</b>, the company task management system.`,
    `Sign in with this email address (<b>${esc(opts.to)}</b>) and the temporary password below:`,
    `<b style="font-size:16px;letter-spacing:1px">${esc(opts.password)}</b>`,
    `You will be asked to set your own password the first time you sign in.`,
  ];
  sendMail(
    opts.to,
    `Your ${APP_NAME} account`,
    emailShell("Welcome — your account is ready", lines, `${APP_URL}/login`, "Sign in")
  );
}

export function notifyPasswordReset(opts: {
  to: string;
  name: string;
  password: string;
}) {
  const lines = [
    `Hi ${esc(opts.name)},`,
    `Your password on <b>${APP_NAME}</b> has been reset by the administrator.`,
    `Sign in with the temporary password below:`,
    `<b style="font-size:16px;letter-spacing:1px">${esc(opts.password)}</b>`,
    `You will be asked to set your own password when you sign in.`,
  ];
  sendMail(
    opts.to,
    `Your ${APP_NAME} password was reset`,
    emailShell("Password reset", lines, `${APP_URL}/login`, "Sign in")
  );
}

export function notifyTaskComment(opts: {
  to: string;
  recipientName: string;
  taskId: number;
  taskTitle: string;
  commenter: string;
  comment: string;
}) {
  const lines = [
    `Hi ${esc(opts.recipientName)},`,
    `<b>${esc(opts.commenter)}</b> commented on <b>${esc(opts.taskTitle)}</b>:`,
    `<i>"${esc(opts.comment.length > 200 ? opts.comment.slice(0, 200) + "…" : opts.comment)}"</i>`,
  ];
  sendMail(
    opts.to,
    `New comment on: ${opts.taskTitle}`,
    emailShell("New comment on your task", lines, `${APP_URL}/tasks/${opts.taskId}`, "View discussion")
  );
}
