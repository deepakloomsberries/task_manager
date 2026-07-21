# Deployment & Maintenance Guide (step by step, for non-programmers)

This guide contains **everything** needed to install, run, maintain, and move this app —
written so it can be followed with zero coding knowledge. It is based on the real
deployment done on `tasks.donetella.com` (Ubuntu 24.04 VPS) in July 2026, including
every small problem that came up and its fix.

> **The golden rule:** your live data is only 3 things —
> the database file `prisma/dev.db`, the `uploads/` folder, and the `.env` file.
> Never delete these. Everything else can be re-downloaded from GitHub any time.

---

## Part 1 — Fresh installation on a new Ubuntu server

Follow this from top to bottom on a brand-new server (or when moving servers).

### 1.1 Log in to the server

From Windows PowerShell:

```
ssh root@YOUR.SERVER.IP
```

### 1.2 Install Node.js 22

Ubuntu's built-in `apt install nodejs` is TOO OLD — always use NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v        # must print v20 or higher, e.g. v22.23.1
```

### 1.3 Get the app code onto the server

**Preferred way (makes future updates easy):**

```bash
cd /home/kapil
git clone -b claude/internal-task-management-app-qrsumh https://github.com/deepakloomsberries/task_manager.git
cd task_manager
```

(Alternative: download the branch as a zip from GitHub, unzip, upload with WinSCP.
Works too, but updates are more manual.)

> Note: files starting with a dot (`.env.example`, `.gitignore`) are invisible to
> plain `ls` — use `ls -a` to see them. They ARE there.

### 1.4 Create the settings file (`.env`)

```bash
cp .env.example .env
```

**Generate the AUTH_SECRET** (this signs the login cookies — every install needs its own):

```bash
openssl rand -hex 32
```

It prints 64 random characters, e.g. `78c71eb7f404...`. Copy them
(in most SSH windows, selecting text with the mouse copies it automatically;
right-click pastes).

Now edit the file:

```bash
nano .env
```

Nano basics: move with arrow keys · save = `Ctrl+O` then `Enter` · exit = `Ctrl+X`.

Fill it like this:

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="<paste the 64 characters from openssl here>"
APP_URL="https://tasks.donetella.com"
UPLOAD_DIR="/home/kapil/task_manager/uploads"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_USER="your-gmail@gmail.com"
SMTP_PASS="the16charapppassword"
SMTP_FROM="Looms & Berries Tasks <your-gmail@gmail.com>"
```

**Common mistakes (both happened in the real deployment):**

- ⚠️ **Gmail shows the app password WITH spaces (`yztr dzlu vhrq wjsq`) — you must type
  it WITHOUT spaces (`yztrdzluvhrqwjsq`).**
- ⚠️ **Don't leave `AUTH_SECRET` as the placeholder text** — generate a real one with
  the `openssl` command above.
- Keep `UPLOAD_DIR` inside the project folder as shown, so the backup script
  (Part 3) automatically includes it.

**How to get the Gmail App Password** (needed for email notifications):

1. Google Account → **Security** → turn on **2-Step Verification** (required).
2. Security → **App passwords** → create one (name it anything, e.g. `tasks`).
3. Google shows 16 characters — use them in `SMTP_PASS` **without spaces**.
4. Email is optional: leave `SMTP_USER`/`SMTP_PASS` empty and the app works fine,
   it just doesn't send emails.

Verify your edits landed correctly:

```bash
grep -E "AUTH_SECRET|SMTP_PASS|UPLOAD_DIR" .env
```

### 1.5 Install, create the database, build

```bash
npm install
npm run setup      # creates the database + the admin login
npm run build      # compiles the app (takes ~a minute)
```

`npm run setup` prints: `Created admin user sales@loomsberries.com (password: Admin@12345)`.

Warnings during `npm install` (deprecated packages, "5 vulnerabilities") are normal —
ignore them, and do **not** run `npm audit fix --force` (it can break the app).

### 1.6 Quick test

```bash
npm start
```

Wait for `✓ Ready`, then from a **second** SSH window:

```bash
curl -I http://localhost:3000/login      # expect: HTTP/1.1 200 OK
```

> A running server looks "stuck" — it just sits there silently waiting for visitors.
> That is normal. Press `Ctrl+C` in the first window to stop it, because the next
> step runs it properly in the background.

### 1.7 Run it permanently (systemd service)

```bash
nano /etc/systemd/system/task-manager.service
```

Paste:

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

Save + exit, then:

```bash
systemctl daemon-reload
systemctl enable --now task-manager
systemctl status task-manager       # want: green "active (running)" — press q to exit
```

The app now starts automatically after every reboot or power cut.

> If some other app already uses port 3000 (check: `ss -tlnp | grep ":3000 "`),
> add `Environment=PORT=3001` under `[Service]` and use 3001 in the nginx step below.

### 1.8 DNS record

In the panel where **donetella.com** is managed, add:

| Type | Name | Value |
|---|---|---|
| A | `tasks` | your server IP |

Then on the server, repeat until it prints the IP (takes 5–60 minutes):

```bash
dig +short tasks.donetella.com
```

> If certbot (next step) fails with **NXDOMAIN**, it means this DNS record doesn't
> exist yet or hasn't propagated — wait and retry. This exact error happened during
> the first deployment.

### 1.9 nginx + HTTPS

```bash
nano /etc/nginx/sites-available/tasks.donetella.com
```

Paste:

```nginx
server {
    server_name tasks.donetella.com;
    client_max_body_size 25m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

⚠️ `client_max_body_size 25m;` is REQUIRED — without it file attachments fail with a 413 error.

```bash
ln -s /etc/nginx/sites-available/tasks.donetella.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d tasks.donetella.com
```

Certbot ends with "Successfully deployed certificate" and renews itself automatically
forever (verify any time with `certbot renew --dry-run`).

### 1.10 First login

Open `https://tasks.donetella.com`:

- Email: `sales@loomsberries.com` — Password: `Admin@12345`
- The app forces you to set a new password immediately. **Store it safely — this is
  the master admin login.**

Then in the app: **Departments** → add departments → **Users → Add User** for each
employee (give everyone the same temporary password, e.g. `Welcome@2026` — the app
forces each person to change it on their first login).

---

## Part 2 — Updating the app (when code changes on GitHub)

**Code changes do nothing until you rebuild and restart.** That's the key thing to know.

If installed with `git clone` (recommended):

```bash
cd /home/kapil/task_manager
git pull
npm install
npm run build
systemctl restart task-manager
```

If installed from a zip: download the new zip, copy files over the old ones —
but **never overwrite `.env`, `prisma/dev.db`, or `uploads/`** — then:

```bash
cd /home/kapil/task_manager && npm install && npm run build && systemctl restart task-manager
```

What to run after which change:

| Changed | Command |
|---|---|
| Any code file | `npm run build && systemctl restart task-manager` |
| `.env` only | `systemctl restart task-manager` |
| `package.json` | `npm install && npm run build && systemctl restart task-manager` |
| `prisma/schema.prisma` | `npx prisma db push && npm run build && systemctl restart task-manager` |
| nginx config | `nginx -t && systemctl reload nginx` |

---

## Part 3 — Backups

Set up once (single copy-paste — runs nightly at 2 AM, keeps 14 days):

```bash
(crontab -l 2>/dev/null; echo '0 2 * * * d=$(date +\%F); mkdir -p /home/kapil/backups/$d; cp /home/kapil/task_manager/prisma/dev.db /home/kapil/backups/$d/; cp -r /home/kapil/task_manager/uploads /home/kapil/backups/$d/ 2>/dev/null; find /home/kapil/backups -maxdepth 1 -mtime +14 -exec rm -rf {} \;') | crontab -
```

Verify it registered: `crontab -l`

> The `/home/kapil/backups` folder appears only **after the first 2 AM run** — seeing
> "No such file or directory" on day one is normal.

Occasionally copy the newest backup folder to your own PC with WinSCP
(connect to the server IP as root, drag the folder to your desktop). This protects
you even if the entire server is lost.

---

## Part 4 — Moving to a NEW server (full migration)

1. On the **old** server, grab the 3 data items:
   ```bash
   ls /home/kapil/backups                    # pick the newest dated folder
   ```
   Copy to your PC with WinSCP: that backup folder's `dev.db` + `uploads`, **plus**
   `/home/kapil/task_manager/.env`.
2. On the **new** server, do all of Part 1 **except**: skip `npm run setup`'s effect by
   doing this order instead —
   ```bash
   npm install
   # copy your saved .env into /home/kapil/task_manager/.env  (WinSCP)
   # copy your saved dev.db into /home/kapil/task_manager/prisma/dev.db  (WinSCP)
   # copy your saved uploads folder into /home/kapil/task_manager/uploads  (WinSCP)
   npx prisma generate
   npm run build
   ```
   (Do NOT run `npm run seed`/`npm run setup` — your copied `dev.db` already contains
   all users and tasks. Setup would not harm existing data, but it's unnecessary.)
3. Continue Part 1 from step 1.7 (systemd), 1.8 (change the DNS A record to the NEW
   server's IP), 1.9 (nginx + certbot).
4. Everyone's logins, tasks, files — everything continues exactly where it was.

---

## Part 5 — Troubleshooting

The 3 commands that solve/explain 90% of problems:

```bash
systemctl status task-manager        # is it running? want green "active"
systemctl restart task-manager       # fixes most issues
journalctl -u task-manager -n 50     # last 50 log lines (share these when asking for help)
```

| Symptom | Cause / Fix |
|---|---|
| "502 Bad Gateway" in browser | App is down → `systemctl restart task-manager` |
| Site not loading at all | nginx down → `systemctl restart nginx` |
| `certbot` fails with **NXDOMAIN** | DNS record missing or not propagated yet → check `dig +short tasks.donetella.com`, wait, retry |
| File upload fails / 413 error | File over 20 MB, or nginx missing `client_max_body_size 25m;` |
| Emails not arriving | `journalctl -u task-manager \| grep mail` — "SMTP not configured" = `.env` values empty; auth error = wrong/revoked app password (check for spaces!) |
| `node: command not found` | Node not installed → Part 1.2 |
| `ls` doesn't show `.env` | Dot-files are hidden → `ls -a` |
| Terminal "stuck" after `npm start` | It's not stuck — the server is running. `Ctrl+C` stops it. Use systemd instead (Part 1.7) |
| Employee forgot password | No SSH needed → admin panel → Users → Edit → Reset password |
| Employee left the company | Admin panel → Users → Deactivate (blocks login, keeps history) |
| Admin (you) forgot the master password | See Part 6 |
| Server rebooted | Nothing to do — app auto-starts; verify with `systemctl status task-manager` |

---

## Part 6 — Emergency: reset the admin password from SSH

If the admin password is lost, run this on the server (replace `NewPassword123`):

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

Then log in with `NewPassword123` — the app will force you to set a fresh password.

---

## Part 7 — Monthly 2-minute health check

```bash
ls /home/kapil/backups          # dated folders exist?
df -h /                         # disk not filling up?
certbot renew --dry-run         # HTTPS auto-renewal healthy? ("Congratulations")
systemctl status task-manager   # green?
```

## Never do these

- ❌ Delete/edit `prisma/dev.db`, `uploads/`, or `.env` — that's the live data.
- ❌ `npm audit fix --force` — can break the app despite npm suggesting it.
- ❌ `apt install nodejs` without NodeSource (Part 1.2) — too old.
- ❌ Put real passwords in GitHub — `.env` is intentionally excluded from the repository.
