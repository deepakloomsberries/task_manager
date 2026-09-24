/**
 * Nightly backup.
 *
 * Takes a consistent snapshot of the SQLite database with `VACUUM INTO` (safe
 * while the app is running — unlike copying dev.db, which can capture a
 * half-written file or miss data still in the WAL), copies the uploads folder,
 * verifies the snapshot, and prunes backups older than BACKUP_KEEP_DAYS.
 *
 *   0 2 * * * cd /home/kapil/task_manager && /usr/bin/npx tsx scripts/backup.ts >> /var/log/task-backup.log 2>&1
 *
 * Env: BACKUP_DIR (default ../backups), BACKUP_KEEP_DAYS (default 14),
 * UPLOAD_DIR (default ./uploads). Exits non-zero on failure so cron mails it.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

// Minimal .env loader so the script works standalone under cron.
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR ?? path.join(process.cwd(), "..", "backups"));
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS ?? 14);
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

async function main() {
  const stamp = new Date().toISOString().slice(0, 10);
  const dir = path.join(BACKUP_DIR, stamp);
  fs.mkdirSync(dir, { recursive: true });

  // 1. Database — VACUUM INTO refuses to overwrite, so clear a same-day rerun.
  const dbFile = path.join(dir, "dev.db");
  fs.rmSync(dbFile, { force: true });
  const db = new PrismaClient();
  try {
    await db.$executeRawUnsafe(`VACUUM INTO '${dbFile.replace(/'/g, "''")}'`);
  } finally {
    await db.$disconnect();
  }

  // 2. Verify the snapshot opens and passes an integrity check.
  const check = new PrismaClient({ datasources: { db: { url: `file:${dbFile}` } } });
  try {
    const rows = await check.$queryRawUnsafe<{ integrity_check: string }[]>("PRAGMA integrity_check");
    if (rows[0]?.integrity_check !== "ok") throw new Error(`integrity_check: ${JSON.stringify(rows)}`);
  } finally {
    await check.$disconnect();
  }

  // 3. Uploaded files.
  if (fs.existsSync(UPLOAD_DIR)) {
    fs.cpSync(UPLOAD_DIR, path.join(dir, "uploads"), { recursive: true });
  }

  // 4. Retention.
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  for (const name of fs.readdirSync(BACKUP_DIR)) {
    const t = Date.parse(name);
    if (/^\d{4}-\d{2}-\d{2}$/.test(name) && !isNaN(t) && t < cutoff) {
      fs.rmSync(path.join(BACKUP_DIR, name), { recursive: true, force: true });
    }
  }

  const mb = (fs.statSync(dbFile).size / 1_048_576).toFixed(1);
  console.log(`[${new Date().toISOString()}] backup ok → ${dir} (db ${mb} MB)`);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] backup FAILED`, err);
  process.exit(1);
});
