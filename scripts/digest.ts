/**
 * Weekly team time digest.
 *
 * Emails every active manager/admin a summary of the previous week's logged
 * hours per person (and each person's submit/approve status). Intended to run
 * once a week via cron, e.g. Monday morning:
 *
 *   0 9 * * 1 cd /home/kapil/task_manager && /usr/bin/npx tsx scripts/digest.ts >> /var/log/task-digest.log 2>&1
 *
 * Uses the same .env file as the app. If SMTP is not configured it prints what
 * it would send and exits.
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

function fmtHours(h: number) {
  const m = Math.round(h * 60);
  if (m <= 0) return "0m";
  const H = Math.floor(m / 60);
  const M = m % 60;
  return H > 0 ? (M > 0 ? `${H}h ${M}m` : `${H}h`) : `${M}m`;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

async function main() {
  const now = new Date();
  // The previous full week: Sunday 00:00 (last week) up to this week's Sunday.
  const thisSunday = new Date(now);
  thisSunday.setHours(0, 0, 0, 0);
  thisSunday.setDate(thisSunday.getDate() - thisSunday.getDay());
  const weekStart = new Date(thisSunday);
  weekStart.setDate(weekStart.getDate() - 7);
  const weekEnd = thisSunday; // exclusive
  const lastDay = new Date(weekEnd.getTime() - 86400000);

  const [entries, subs, managers, activeCount] = await Promise.all([
    db.timeEntry.findMany({
      where: { date: { gte: weekStart, lt: weekEnd } },
      include: { user: { select: { id: true, name: true } } },
    }),
    db.timesheetSubmission.findMany({ where: { weekStart } }),
    db.user.findMany({
      where: { active: true, emailNotifications: true, role: { in: ["ADMIN", "MANAGER"] } },
    }),
    db.user.count({ where: { active: true } }),
  ]);

  const subStatus = new Map<number, string>(subs.map((s) => [s.userId, s.status]));

  const perUser = new Map<number, { name: string; hours: number; count: number }>();
  for (const e of entries) {
    const cur = perUser.get(e.userId) ?? { name: e.user.name, hours: 0, count: 0 };
    cur.hours += e.hours;
    cur.count += 1;
    perUser.set(e.userId, cur);
  }
  const rows = Array.from(perUser.entries())
    .map(([userId, r]) => ({ userId, ...r }))
    .sort((a, b) => b.hours - a.hours);
  const totalHours = rows.reduce((s, r) => s + r.hours, 0);

  if (rows.length === 0) {
    console.log(`No time logged for week of ${fmtDate(weekStart)} — nothing to send.`);
    await db.$disconnect();
    return;
  }

  const statusBadge = (userId: number) => {
    const st = subStatus.get(userId);
    if (st === "APPROVED") return `<span style="color:#16a34a">approved</span>`;
    if (st === "SUBMITTED") return `<span style="color:#d97706">submitted</span>`;
    if (st === "REJECTED") return `<span style="color:#dc2626">changes requested</span>`;
    return `<span style="color:#94a3b8">not submitted</span>`;
  };

  const tableRows = rows
    .map(
      (r) =>
        `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9">${esc(r.name)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600">${fmtHours(r.hours)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;color:#64748b">${r.count}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:13px">${statusBadge(r.userId)}</td>
        </tr>`
    )
    .join("");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
    <h2 style="margin:0 0 4px;color:#0f172a">Looms &amp; Berries Tasks</h2>
    <h3 style="margin:12px 0 4px;color:#0369a1">Weekly time summary</h3>
    <p style="color:#334155;font-size:14px;margin:0 0 12px">
      Week of ${fmtDate(weekStart)} – ${fmtDate(lastDay)} · <b>${fmtHours(totalHours)}</b> logged by
      ${rows.length} of ${activeCount} people.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="text-align:left;color:#64748b;font-size:12px;text-transform:uppercase">
          <th style="padding:6px 8px">Employee</th>
          <th style="padding:6px 8px;text-align:right">Hours</th>
          <th style="padding:6px 8px;text-align:right">Entries</th>
          <th style="padding:6px 8px">Status</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
    <p style="margin:20px 0 0">
      <a href="${APP_URL}/timesheet/team" style="background:#0284c7;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Open team time sheet</a>
    </p>
  </div>`;

  const subject = `Weekly team time summary — week of ${fmtDate(weekStart)}`;

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
  for (const m of managers) {
    if (!transporter) {
      console.log(`[digest skipped — SMTP not configured] to=${m.email} subject="${subject}"`);
      continue;
    }
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? `"Looms & Berries Tasks" <${process.env.SMTP_USER}>`,
        to: m.email,
        subject,
        html,
      });
      sent++;
      console.log(`[digest sent] to=${m.email}`);
    } catch (e) {
      console.error(`[digest failed] to=${m.email}:`, (e as Error).message);
    }
  }
  console.log(`Done. ${sent} digest(s) sent for week of ${fmtDate(weekStart)}.`);
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
