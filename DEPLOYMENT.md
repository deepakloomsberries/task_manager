# Deployment & Maintenance Guide

The operations runbook for this application: installation, updates, backups, server
migration, and troubleshooting. Every step is written as exact commands with expected
output, so it can be followed without prior server administration experience. It is
based on the production deployment on `task.donetella.com` (Ubuntu 24.04 VPS) and
documents the issues encountered there together with their resolutions.

> **Critical data.** The application's live data consists of exactly three items:
> the PostgreSQL database `task_manager`, the `uploads/` directory, and the `.env`
> file. These must never be deleted or overwritten. Everything else can be restored
> from this repository at any time. (Before the move to Postgres the database was the
> file `prisma/dev.db` — keep that file as an archive; see Part 0.)

---

## Part 0 — One-time upgrade: moving this server from SQLite to PostgreSQL

Do this **once**, on the existing server, when you first pull a version that uses
Postgres. It takes about 10 minutes and the app is offline for a couple of them.
Your SQLite file is only read, never changed, so you can always go back (0.8).

### 0.1 Stop the app and keep a safety copy

```bash
cd /home/kapil/task_manager
systemctl stop task-manager
mkdir -p /home/kapil/backups/pre-postgres
cp prisma/dev.db* .env /home/kapil/backups/pre-postgres/
cp -r uploads /home/kapil/backups/pre-postgres/ 2>/dev/null
ls -la /home/kapil/backups/pre-postgres/        # dev.db should be there
```

### 0.2 Install PostgreSQL

```bash
apt update && apt install -y postgresql
systemctl enable --now postgresql
sudo -u postgres psql -c "select version();"   # prints "PostgreSQL 16…"
```

### 0.3 Create the database and a login for the app

```bash
DBPASS=$(openssl rand -hex 16)
echo "Database password: $DBPASS"     # note it down somewhere safe
sudo -u postgres psql -c "CREATE USER taskapp WITH PASSWORD '$DBPASS';"
sudo -u postgres psql -c "CREATE DATABASE task_manager OWNER taskapp;"
```

Postgres only listens on the server itself (`localhost`) by default — keep it that
way; nothing outside needs to reach it.

### 0.4 Get the new code

```bash
git pull origin claude/todo-count-paras-mfemnu
npm install
```

### 0.5 Point the app at Postgres

Run this **in the same SSH session as 0.3** (it uses `$DBPASS`). The old SQLite line
is kept, commented out, for rollback:

```bash
sed -i 's|^DATABASE_URL=|# OLD SQLite: DATABASE_URL=|' .env
echo "DATABASE_URL=\"postgresql://taskapp:$DBPASS@localhost:5432/task_manager\"" >> .env
grep DATABASE_URL .env
```

Expected: one commented `file:./dev.db` line and one active `postgresql://…` line.

### 0.6 Create the tables and copy your data

```bash
npx prisma db push
npm run db:migrate-from-sqlite
```

The second command copies every table from `prisma/dev.db` into Postgres, keeping
all ids, then **compares every row** in both databases. It ends with:

```
✓ All 37 tables copied and verified (… rows).
```

If it prints `Migration FAILED`, nothing has been switched on yet — send the output
for help. It refuses to run twice into the same database (so data can't be
duplicated); to retry from scratch:
`sudo -u postgres psql -c "DROP DATABASE task_manager;" -c "CREATE DATABASE task_manager OWNER taskapp;"`
then repeat 0.6.

### 0.7 Build and start

```bash
npm run build && systemctl start task-manager
systemctl status task-manager --no-pager | head -5    # active (running)
npm run backup                                          # first Postgres backup
```

Sign in and check a few things you know well (your tasks, a timesheet, messages).
The nightly backup cron from Part 3 keeps working unchanged — it now uses `pg_dump`.

### 0.8 Rollback (only if something is wrong)

Anything created after the switch lives only in Postgres, so decide quickly.

```bash
systemctl stop task-manager
sed -i 's|^DATABASE_URL="postgresql|# POSTGRES: DATABASE_URL="postgresql|; s|^# OLD SQLite: DATABASE_URL=|DATABASE_URL=|' .env
git checkout db0bb3a          # the last SQLite version
npm install && npx prisma generate && npm run build && systemctl start task-manager
```

Afterwards the SQLite file `prisma/dev.db` is no longer used. Leave it where it is as
an archive (it's also in `/home/kapil/backups/pre-postgres/`).

---

## Part 1 — Installation on a new Ubuntu server

Follow this section from top to bottom on a fresh server (also used when migrating servers).

### 1.1 Connect to the server

From Windows PowerShell (or any terminal):

```
ssh root@YOUR.SERVER.IP
```

### 1.2 Install Node.js 22

The Node.js package in Ubuntu's default repositories is outdated. Install from
NodeSource instead:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v        # must print v20 or higher, e.g. v22.23.1
```

### 1.3 Obtain the application code

Recommended (enables simple future updates):

```bash
cd /home/kapil
git clone -b claude/internal-task-management-app-qrsumh https://github.com/deepakloomsberries/task_manager.git
cd task_manager
```

Alternative: download the branch as a zip from GitHub, extract it, and upload with
WinSCP. This works, but updates become a manual copy process (see Part 2).

> Note: files whose names start with a dot (`.env.example`, `.gitignore`) are not
> shown by a plain `ls`. Use `ls -a` to list them; they are present.

### 1.4 Create the configuration file (`.env`)

```bash
cp .env.example .env
```

Generate the `AUTH_SECRET` (used to sign login session cookies — each installation
requires its own unique value):

```bash
openssl rand -hex 32
```

This prints a 64-character random string. Copy it (in most SSH clients, selecting
text with the mouse copies it; right-click pastes).

Edit the file:

```bash
nano .env
```

Nano reference: navigate with arrow keys · save = `Ctrl+O` then `Enter` · exit = `Ctrl+X`.

Set the values as follows:

```
DATABASE_URL="postgresql://taskapp:<database password>@localhost:5432/task_manager"
AUTH_SECRET="<the 64-character string from openssl>"
APP_URL="https://task.donetella.com"
UPLOAD_DIR="/home/kapil/task_manager/uploads"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_USER="your-address@gmail.com"
SMTP_PASS="the16charapppassword"
SMTP_FROM="Looms & Berries Tasks <your-address@gmail.com>"
```

Common configuration errors (both occurred during the original deployment):

- **Gmail displays the app password with spaces (`abcd efgh ijkl mnop`); it must be
  entered without spaces (`abcdefghijklmnop`).**
- **`AUTH_SECRET` must not remain the placeholder text** — generate a real value with
  the `openssl` command above.
- Keep `UPLOAD_DIR` inside the project directory as shown so the backup job
  (Part 3) automatically covers it.

Obtaining a Gmail App Password (required for email notifications):

1. Google Account → **Security** → enable **2-Step Verification** (prerequisite).
2. Security → **App passwords** → create one (any name, e.g. `tasks`).
3. Google displays 16 characters — enter them in `SMTP_PASS` without spaces.
4. Email is optional: if `SMTP_USER`/`SMTP_PASS` are left empty, the application
   runs normally and simply skips sending email.

Verify the values were saved correctly:

```bash
grep -E "AUTH_SECRET|SMTP_PASS|UPLOAD_DIR" .env
```

### 1.4b Install PostgreSQL and create the database

```bash
apt update && apt install -y postgresql
systemctl enable --now postgresql
DBPASS=$(openssl rand -hex 16); echo "Database password: $DBPASS"
sudo -u postgres psql -c "CREATE USER taskapp WITH PASSWORD '$DBPASS';"
sudo -u postgres psql -c "CREATE DATABASE task_manager OWNER taskapp;"
```

Put that password into `DATABASE_URL` in `.env` (step 1.4).

### 1.5 Install dependencies, initialize the database, build

```bash
npm install
npm run setup      # creates the database and the initial admin account
npm run build      # compiles the application (approximately one minute)
```

`npm run setup` prints: `Created admin user sales@loomsberries.com (password: Admin@12345)`.

Warnings during `npm install` (deprecated packages, "5 vulnerabilities") are expected
and can be ignored. Do **not** run `npm audit fix --force` — it can install breaking
package versions.

### 1.6 Verify the application starts

```bash
npm start
```

Wait for `✓ Ready`, then from a second SSH session:

```bash
curl -I http://localhost:3000/login      # expected: HTTP/1.1 200 OK
```

> A foreground server process produces no further output while it waits for
> requests — this is normal operation, not a hang. Stop it with `Ctrl+C`; the next
> step configures it to run as a background service.

### 1.7 Configure the systemd service

```bash
nano /etc/systemd/system/task-manager.service
```

Content:

```ini
[Unit]
Description=Looms & Berries Task Manager
After=network.target

[Service]
WorkingDirectory=/home/kapil/task_manager
ExecStart=/usr/bin/npm start
Restart=always
EnvironmentFile=/home/kapil/task_manager/.env

[Install]
WantedBy=multi-user.target
```

Save, exit, then:

```bash
systemctl daemon-reload
systemctl enable --now task-manager
systemctl status task-manager       # expected: "active (running)" — press q to return
```

The application now starts automatically after every reboot.

Bind the application to localhost only, so port 3000 is not reachable from outside
the server (all public traffic goes through Apache with HTTPS):

```bash
mkdir -p /etc/systemd/system/task-manager.service.d
cat > /etc/systemd/system/task-manager.service.d/override.conf <<'EOF'
[Service]
ExecStart=
ExecStart=/usr/bin/npm start -- -H 127.0.0.1
EOF
systemctl daemon-reload && systemctl restart task-manager
ss -tlnp | grep ':3000'      # expected: 127.0.0.1:3000
```

> This requires application code from 2026-07-22 or later — earlier builds
> generated `localhost` redirect URLs when bound to 127.0.0.1 (see Part 5).

> If another application already occupies port 3000 (check with
> `ss -tlnp | grep ":3000 "`), add `Environment=PORT=3001` under `[Service]` and use
> port 3001 in the Apache configuration below.

### 1.8 DNS record

In the DNS management panel for **donetella.com**, add:

| Type | Name | Value |
|---|---|---|
| A | `task` | server IP address |

On the server, repeat the following until it prints the IP (propagation typically
takes 5–60 minutes):

```bash
dig +short task.donetella.com
```

> If certbot (next step) fails with **NXDOMAIN**, the DNS record does not exist yet
> or has not propagated — wait and retry. This occurred during the original
> deployment and resolved itself once the record propagated.

### 1.9 Apache reverse proxy and HTTPS

The production server uses Apache (it also serves the other company applications).
Ensure the proxy modules are enabled, then create the site:

```bash
a2enmod proxy proxy_http headers
cat > /etc/apache2/sites-available/task.conf <<'EOF'
<VirtualHost *:80>
    ServerName task.donetella.com
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3000/ retry=5 connectiontimeout=5 timeout=120
    ProxyPassReverse / http://127.0.0.1:3000/
    ErrorLog ${APACHE_LOG_DIR}/task_error.log
    CustomLog ${APACHE_LOG_DIR}/task_access.log combined
</VirtualHost>
EOF
a2ensite task && apache2ctl configtest && systemctl reload apache2
certbot --apache -d task.donetella.com
```

Certbot ends with "Successfully deployed certificate" (creating `task-le-ssl.conf`
for port 443) and configures automatic renewal (verify at any time with
`certbot renew --dry-run`).

Notes:

- `ProxyPreserveHost On` is required — the application builds redirect URLs from the
  Host header.
- Apache imposes no request-body limit by default, so 20 MB file uploads work without
  additional configuration (nginx would need `client_max_body_size`).
- If an unused nginx is installed and failing to start because Apache owns ports
  80/443, disable it: `systemctl disable --now nginx`.

### 1.10 First login

Open `https://task.donetella.com`:

- Email: `sales@loomsberries.com` — Password: `Admin@12345`
- The application requires an immediate password change. Store the new password
  securely — it is the primary administrator credential.

Initial setup in the application: **Departments** → create departments →
**Users → Add User** for each employee. A shared temporary password (e.g.
`Welcome@2026`) is acceptable — every user is required to set their own password at
first login.

### 1.11 Installing on phones (PWA)

The application installs to a phone's home screen directly from the browser — no app
store involved. Instructions to share with employees (HTTPS must be active first):

- **Android (Chrome):** open the site → browser menu (⋮) → **Add to Home screen** /
  **Install app**.
- **iPhone (Safari):** open the site → Share button → **Add to Home Screen**.

It then opens full-screen with its own icon, like a native app.

---

## Part 2 — Updating the application

Code changes take effect only after a rebuild and service restart.

If installed with `git clone` (recommended):

```bash
cd /home/kapil/task_manager
git pull
npm install
npm run build
systemctl restart task-manager
```

If installed from a zip: download the new zip and copy the files over the existing
ones — **excluding `.env`, `prisma/dev.db`, and `uploads/`** — then:

```bash
cd /home/kapil/task_manager && npm install && npm run build && systemctl restart task-manager
```

Command reference by type of change:

| Changed | Command |
|---|---|
| Any code file | `npm run build && systemctl restart task-manager` |
| `.env` only | `systemctl restart task-manager` |
| `package.json` | `npm install && npm run build && systemctl restart task-manager` |
| `prisma/schema.prisma` | `npx prisma db push && npm run build && systemctl restart task-manager` |
| Apache configuration | `apache2ctl configtest && systemctl reload apache2` |

---

## Part 3 — Backups

One-time setup (nightly at 02:00, 14-day retention). `scripts/backup.ts` takes a
consistent snapshot with SQLite's `VACUUM INTO` (safe while the app is running —
a plain `cp` of `dev.db` can capture a half-written file or miss data still in
the WAL), runs an integrity check on it, copies `uploads/`, and prunes old days:

```bash
# Remove the old cp-based entry if it's there, then add the new one.
crontab -l 2>/dev/null | grep -v 'cp /home/kapil/task_manager/prisma/dev.db' | crontab -
(crontab -l 2>/dev/null; echo '0 2 * * * cd /home/kapil/task_manager && /usr/bin/npx tsx scripts/backup.ts >> /var/log/task-backup.log 2>&1') | crontab -
```

Backups land in `/home/kapil/backups/YYYY-MM-DD/` as `db.dump` (a `pg_dump`
archive, checked with `pg_restore --list` after every run) plus `uploads/`
(override with `BACKUP_DIR`, retention with `BACKUP_KEEP_DAYS`). Run once by hand to
check: `npm run backup`.

Restore a day's backup:

```bash
systemctl stop task-manager
cd /home/kapil/task_manager && set -a && . ./.env && set +a
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" /home/kapil/backups/2026-10-01/db.dump
cp -r /home/kapil/backups/2026-10-01/uploads/. uploads/
systemctl start task-manager
``` Keep a copy off the server too (e.g. a
weekly `rclone`/`scp` of the backups folder to Google Drive or another machine).

Required — nightly recurring-task roll-over at 00:05 (closes out each elapsed
recurring occurrence — marking it missed if nobody finished it — and creates the
one fresh occurrence for the new period; also collapses any stray duplicate live
occurrences of the same job and purges old archived ones). Without this cron
entry, recurring tasks never roll over or get deduplicated:

```bash
(crontab -l 2>/dev/null; echo '5 0 * * * cd /home/kapil/task_manager && /usr/bin/npx tsx scripts/recurring.ts >> /var/log/task-recurring.log 2>&1') | crontab -
```

Recommended — morning summary email at 08:00 (each person gets their overdue and
due-today tasks, what's waiting for their approval, and who's off today and this
week; skipped on their own weekend, holiday or leave; people can turn it off in
Settings; requires SMTP to be configured in `.env`):

```bash
(crontab -l 2>/dev/null; echo '0 8 * * * cd /home/kapil/task_manager && /usr/bin/npx tsx scripts/reminders.ts >> /var/log/task-reminders.log 2>&1') | crontab -
```

Recommended — Friday 16:00 timesheet reminder (in-app notification, browser push
and email for everyone whose week isn't submitted yet; safe to re-run — nobody
is reminded twice in a day). Set `TIMESHEET_REMINDER_ROLES` in `.env` to change
who gets it (default `EMPLOYEE,MANAGER`):

```bash
(crontab -l 2>/dev/null; echo '0 16 * * 5 cd /home/kapil/task_manager && /usr/bin/npx tsx scripts/timesheet-reminder.ts >> /var/log/task-timesheet-reminder.log 2>&1') | crontab -
```

Verify registration: `crontab -l`

> The `/home/kapil/backups` directory is created by the first 02:00 run. "No such
> file or directory" before that point is expected.

Periodically copy the most recent backup directory to a local machine with WinSCP
(connect to the server IP as root). Off-server copies protect against total server
loss.

---

## Part 4 — Migrating to a new server

1. On the old server, collect the three data items:
   ```bash
   npm run backup                            # fresh db.dump + uploads
   ls /home/kapil/backups                    # the newest dated directory
   ```
   Copy via WinSCP: that backup's `db.dump` and `uploads`, plus
   `/home/kapil/task_manager/.env`.
2. On the new server, perform Part 1 (including 1.4b — create the Postgres user and
   database with the **same password** as in the saved `.env`), then restore data
   instead of seeding:
   ```bash
   npm install
   # via WinSCP: place the saved .env at /home/kapil/task_manager/.env
   # via WinSCP: place db.dump at /home/kapil/db.dump
   # via WinSCP: place the saved uploads directory at /home/kapil/task_manager/uploads
   set -a && . ./.env && set +a
   pg_restore --no-owner -d "$DATABASE_URL" /home/kapil/db.dump
   npx prisma generate
   npm run build
   ```
   Do not run `npm run setup` — the restored database already contains all users and
   data.
3. Continue Part 1 from step 1.7 (systemd), then 1.8 (update the DNS A record to the
   new server's IP), then 1.9 (Apache and certbot).
4. All accounts, tasks, and files continue unchanged.

---

## Part 5 — Troubleshooting

Primary diagnostic commands:

```bash
systemctl status task-manager        # service state — expected: "active (running)"
systemctl restart task-manager       # resolves most transient issues
journalctl -u task-manager -n 50     # last 50 log lines — include these when reporting a problem
```

| Symptom | Cause / Resolution |
|---|---|
| "502 Bad Gateway" in browser | Application service down → `systemctl restart task-manager` |
| Site not reachable at all | Apache down → `systemctl restart apache2` |
| `certbot` fails with NXDOMAIN | DNS record missing or not yet propagated → check `dig +short task.donetella.com`, wait, retry |
| File upload fails / HTTP 413 | File exceeds 20 MB (Apache needs no size directive; nginx would need `client_max_body_size 25m;`) |
| Browser redirected to `localhost:3000` | Application build is older than 2026-07-22 while bound to 127.0.0.1 — update the code, `npm run build`, restart |
| nginx failed / "Address already in use" | Apache owns ports 80/443 on this server — nginx is unused; `systemctl disable --now nginx` |
| Emails not arriving | `journalctl -u task-manager \| grep mail` — "SMTP not configured" means `.env` values are empty; an authentication error means a wrong or revoked app password (verify it contains no spaces) |
| `node: command not found` | Node.js not installed → Part 1.2 |
| `ls` does not show `.env` | Dot-files are hidden by default → `ls -a` |
| No output after `npm start` | Normal — the server is running in the foreground. `Ctrl+C` stops it; use the systemd service instead (Part 1.7) |
| Employee forgot their password | Admin panel → Users → Edit → Reset password (no server access required) |
| Employee left the company | Admin panel → Users → Deactivate (blocks login immediately, preserves history) |
| Administrator password lost | See Part 6 |
| Server rebooted | No action required — the service auto-starts; verify with `systemctl status task-manager` |

---

## Part 6 — Administrator password reset (server-side)

If the administrator password is lost, run the following on the server (replace
`NewPassword123` with a temporary value):

```bash
cd /home/kapil/task_manager
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();
db.user.update({
  where: { email: 'sales@loomsberries.com' },
  data: { passwordHash: bcrypt.hashSync('NewPassword123', 10), mustChangePassword: true }
}).then(() => { console.log('done'); process.exit(0); });
"
```

Log in with the temporary password; the application will require setting a new one
immediately.

---

## Part 7 — Monthly health check

```bash
ls /home/kapil/backups          # dated backup directories present
df -h /                         # disk usage within limits
certbot renew --dry-run         # certificate auto-renewal functional
systemctl status task-manager   # service active
```

## Part 8 — Error monitoring (Sentry)

The app reports crashes to [Sentry](https://sentry.io) (free tier is plenty).
It stays switched off until a DSN is configured.

1. Create a Sentry project (platform: Next.js) and copy its DSN.
2. Add to `.env`:

   ```
   SENTRY_DSN="https://…@o0.ingest.sentry.io/0"
   NEXT_PUBLIC_SENTRY_DSN="https://…@o0.ingest.sentry.io/0"   # same DSN; baked in at build time
   SENTRY_ENVIRONMENT="production"
   # Optional — readable stack traces (uploads source maps during build):
   # SENTRY_ORG="looms-berries"  SENTRY_PROJECT="task-manager"  SENTRY_AUTH_TOKEN="sntrys_…"
   ```

3. `npm run build && systemctl restart task-manager`.

Server errors (pages, API routes, server actions) and browser errors both show
up in Sentry with the stack trace. Set an alert rule there to email you on new issues.

---

## Prohibited actions

- Do not drop or modify the `task_manager` Postgres database, `uploads/`, or `.env` — this is the live data. Keep `prisma/dev.db` as the pre-Postgres archive.
- Do not run `npm audit fix --force` — it can install breaking package versions.
- Do not install Node.js from Ubuntu's default repositories — use NodeSource (Part 1.2).
- Do not commit real credentials to the repository — `.env` is intentionally excluded
  via `.gitignore`.
