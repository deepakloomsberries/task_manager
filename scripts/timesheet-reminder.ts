/**
 * End-of-week timesheet reminder.
 *
 * Nudges everyone whose timesheet for the current week isn't submitted yet —
 * an in-app notification (plus browser push, if configured) and an email for
 * those who have email notifications on. Safe to re-run: nobody is reminded
 * twice on the same day. Intended for Friday afternoon via cron, e.g.:
 *
 *   0 16 * * 5 cd /home/kapil/task_manager && /usr/bin/npx tsx scripts/timesheet-reminder.ts >> /var/log/task-timesheet-reminder.log 2>&1
 *
 * TIMESHEET_REMINDER_ROLES (default "EMPLOYEE,MANAGER") picks who gets it.
 */
import fs from "fs";
import path from "path";

// Minimal .env loader so the script works standalone under cron. Must run
// before the app modules below are imported, since they read env at load.
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

async function main() {
  const { db } = await import("@/lib/db");
  const { pushNotification } = await import("@/lib/notify");
  const { notifyTimesheetReminder } = await import("@/lib/mail");
  const { findTimesheetReminders, REMINDER_LINK } = await import("@/lib/timesheetReminder");

  const roles = (process.env.TIMESHEET_REMINDER_ROLES ?? "EMPLOYEE,MANAGER")
    .split(",")
    .map((r) => r.trim().toUpperCase())
    .filter(Boolean);

  const reminders = await findTimesheetReminders(new Date(), roles);
  for (const r of reminders) {
    await pushNotification(r.userId, r.message, REMINDER_LINK);
    if (r.emailNotifications) notifyTimesheetReminder({ to: r.email, name: r.name, hours: r.hours });
  }
  console.log(`[${new Date().toISOString()}] timesheet reminders sent: ${reminders.length}`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] timesheet reminder FAILED`, err);
  process.exitCode = 1;
});
