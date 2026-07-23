/**
 * Daily reminder digest.
 *
 * Emails every active user a summary of their overdue and due-today tasks.
 * Intended to be run once each morning via cron, e.g.:
 *
 *   0 8 * * * cd /home/kapil/task_manager && /usr/bin/npx tsx scripts/reminders.ts >> /var/log/task-reminders.log 2>&1
 *
 * Uses the same .env file as the app. If SMTP is not configured, it prints
 * what it would send and exits.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

// Minimal .env loader so the script works standalone under cron.
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const db = new PrismaClient();
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function main() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const users = await db.user.findMany({
    where: { active: true, emailNotifications: true },
    include: {
      tasksAssigned: {
        where: { status: { not: "DONE" }, dueDate: { lt: todayEnd } },
        orderBy: { dueDate: "asc" },
        include: { project: true },
      },
    },
  });

  const configured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  const transporter = configured
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT ?? 465),
        secure: (process.env.SMTP_PORT ?? "465") === "465",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;

  let sent = 0;
  for (const user of users) {
    const overdue = user.tasksAssigned.filter((t) => t.dueDate! < todayStart);
    const dueToday = user.tasksAssigned.filter((t) => t.dueDate! >= todayStart);
    if (overdue.length === 0 && dueToday.length === 0) continue;

    const row = (t: (typeof user.tasksAssigned)[number]) =>
      `<li style="margin:4px 0"><a href="${APP_URL}/tasks/${t.id}" style="color:#0369a1;text-decoration:none">${esc(
        t.title
      )}</a>${t.project ? ` <span style="color:#94a3b8">· ${esc(t.project.name)}</span>` : ""} <span style="color:#94a3b8">· due ${t.dueDate!.toLocaleDateString("en-GB")}</span></li>`;

    const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
      <h2 style="margin:0 0 4px;color:#0f172a">Looms &amp; Berries Tasks</h2>
      <p style="color:#334155;font-size:14px">Good morning ${esc(user.name)}, here is your task summary:</p>
      ${
        overdue.length
          ? `<h3 style="margin:16px 0 4px;color:#dc2626">Overdue (${overdue.length})</h3><ul style="margin:0;padding-left:18px;font-size:14px">${overdue.map(row).join("")}</ul>`
          : ""
      }
      ${
        dueToday.length
          ? `<h3 style="margin:16px 0 4px;color:#d97706">Due today (${dueToday.length})</h3><ul style="margin:0;padding-left:18px;font-size:14px">${dueToday.map(row).join("")}</ul>`
          : ""
      }
      <p style="margin:20px 0 0"><a href="${APP_URL}/my-tasks" style="background:#0284c7;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Open My Tasks</a></p>
    </div>`;

    const subject = `Task reminder: ${overdue.length} overdue, ${dueToday.length} due today`;

    if (!transporter) {
      console.log(`[reminder skipped — SMTP not configured] to=${user.email} subject="${subject}"`);
      continue;
    }
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? `"Looms & Berries Tasks" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject,
        html,
      });
      sent++;
      console.log(`[reminder sent] to=${user.email} (${overdue.length} overdue, ${dueToday.length} today)`);
    } catch (e) {
      console.error(`[reminder failed] to=${user.email}:`, (e as Error).message);
    }
  }
  console.log(`Done. ${sent} reminder(s) sent at ${now.toISOString()}.`);
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
