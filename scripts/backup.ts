/**
 * Nightly backup.
 *
 * Dumps the Postgres database with pg_dump (a consistent snapshot, safe while
 * the app is running), checks the dump is readable with pg_restore --list,
 * copies the uploads folder, and prunes backups older than BACKUP_KEEP_DAYS.
 *
 *   0 2 * * * cd /home/kapil/task_manager && /usr/bin/npx tsx scripts/backup.ts >> /var/log/task-backup.log 2>&1
 *
 * Restore: pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" /home/kapil/backups/<day>/db.dump
 *
 * Env: BACKUP_DIR (default ../backups), BACKUP_KEEP_DAYS (default 14),
 * UPLOAD_DIR (default ./uploads). Exits non-zero on failure so cron mails it.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

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

  // 1. Database. Connection details go in PG* env vars rather than the
  // command line, so the password never shows up in `ps`.
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("DATABASE_URL must be a postgresql:// URL");
  const pgEnv = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.replace(/^\//, ""),
  };
  const dumpFile = path.join(dir, "db.dump");
  execFileSync("pg_dump", ["--format=custom", "--no-owner", "--file", dumpFile], { env: pgEnv, stdio: ["ignore", "ignore", "inherit"] });

  // 2. Verify the dump can be read back and actually contains table data.
  const listing = execFileSync("pg_restore", ["--list", dumpFile], { encoding: "utf8" });
  if (!/TABLE DATA/.test(listing)) throw new Error("pg_dump produced a dump with no table data");

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

  const mb = (fs.statSync(dumpFile).size / 1_048_576).toFixed(1);
  console.log(`[${new Date().toISOString()}] backup ok → ${dir} (db ${mb} MB)`);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] backup FAILED`, err);
  process.exit(1);
});
