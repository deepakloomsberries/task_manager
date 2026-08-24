# Deployment & Maintenance Guide

The operations runbook for this application: installation, updates, backups, server
migration, and troubleshooting. Every step is written as exact commands with expected
output, so it can be followed without prior server administration experience. It is
based on the production deployment on `task.donetella.com` (Ubuntu 24.04 VPS) and
documents the issues encountered there together with their resolutions.

> **Critical data.** The application's live data consists of exactly three items:
> the database file `prisma/dev.db`, the `uploads/` directory, and the `.env` file.
> These must never be deleted or overwritten. Everything else can be restored from
> this repository at any time.

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
DATABASE_URL="file:./dev.db"
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

One-time setup (nightly at 02:00, 14-day retention):

```bash
(crontab -l 2>/dev/null; echo '0 2 * * * d=$(date +\%F); mkdir -p /home/kapil/backups/$d; cp /home/kapil/task_manager/prisma/dev.db /home/kapil/backups/$d/; cp -r /home/kapil/task_manager/uploads /home/kapil/backups/$d/ 2>/dev/null; find /home/kapil/backups -maxdepth 1 -mtime +14 -exec rm -rf {} \;') | crontab -
```

Required — nightly recurring-task roll-over at 00:05 (closes out each elapsed
recurring occurrence — marking it missed if nobody finished it — and creates the
one fresh occurrence for the new period; also collapses any stray duplicate live
occurrences of the same job and purges old archived ones). Without this cron
entry, recurring tasks never roll over or get deduplicated:

```bash
(crontab -l 2>/dev/null; echo '5 0 * * * cd /home/kapil/task_manager && /usr/bin/npx tsx scripts/recurring.ts >> /var/log/task-recurring.log 2>&1') | crontab -
```

Optional — daily reminder emails at 08:00 (each employee receives a digest of their
overdue and due-today tasks; requires SMTP to be configured in `.env`):

```bash
(crontab -l 2>/dev/null; echo '0 8 * * * cd /home/kapil/task_manager && /usr/bin/npx tsx scripts/reminders.ts >> /var/log/task-reminders.log 2>&1') | crontab -
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
   ls /home/kapil/backups                    # identify the newest dated directory
   ```
   Copy via WinSCP: that backup's `dev.db` and `uploads`, plus
   `/home/kapil/task_manager/.env`.
2. On the new server, perform Part 1 with one modification — restore data instead of
   seeding:
   ```bash
   npm install
   # via WinSCP: place the saved .env at /home/kapil/task_manager/.env
   # via WinSCP: place the saved dev.db at /home/kapil/task_manager/prisma/dev.db
   # via WinSCP: place the saved uploads directory at /home/kapil/task_manager/uploads
   npx prisma generate
   npm run build
   ```
   Do not run `npm run setup` — the restored `dev.db` already contains all users and
   data (running it would not damage the data, but it is unnecessary).
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

## Prohibited actions

- Do not delete or modify `prisma/dev.db`, `uploads/`, or `.env` — this is the live data.
- Do not run `npm audit fix --force` — it can install breaking package versions.
- Do not install Node.js from Ubuntu's default repositories — use NodeSource (Part 1.2).
- Do not commit real credentials to the repository — `.env` is intentionally excluded
  via `.gitignore`.
