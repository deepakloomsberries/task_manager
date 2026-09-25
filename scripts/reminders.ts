/**
 * Daily morning digest.
 *
 * Emails every active person (with email and the digest turned on) what needs
 * them today: overdue and due-today tasks, work waiting for their approval,
 * and who's off today and this week. Skipped on their own weekend, office
 * holiday or leave, and when there's nothing to say. Run once each morning:
 *
 *   0 8 * * * cd /home/kapil/task_manager && /usr/bin/npx tsx scripts/reminders.ts >> /var/log/task-reminders.log 2>&1
 *
 * Uses the same .env file as the app. If SMTP is not configured, it prints
 * what it would send and exits.
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
  const { sendMail } = await import("@/lib/mail");
  const { gatherDigests } = await import("@/lib/dailyDigest");

  const digests = await gatherDigests(new Date());
  for (const d of digests) await sendMail(d.email, d.subject, d.html);
  console.log(`[${new Date().toISOString()}] daily digest: ${digests.length} email(s)`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] daily digest FAILED`, err);
  process.exitCode = 1;
});
