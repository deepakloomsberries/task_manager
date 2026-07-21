# Looms & Berries — Task Manager

In-house task management app for all Looms & Berries employees (India, UAE, Saudi Arabia).
Built to replace TaskoPad — no per-user subscription, fully self-hosted.

> 📘 **Operations runbook:** see **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the complete
> step-by-step guide — fresh-server installation (including `AUTH_SECRET` generation),
> updates, backups, server migration, troubleshooting, and emergency admin password
> reset. Based on the production deployment on tasks.donetella.com.

## Features

- **Login with company email** — accounts are created by the admin; there is no self sign-up.
  Every new user gets a temporary password and is forced to change it on first login.
- **Roles** — Admin (full access), Manager (projects + team reports), Employee.
- **Dashboard** — my open / overdue / due-this-week / completed tasks, recent activity, active projects.
- **Tasks** — priorities, due dates, statuses (To Do → In Progress → In Review → Done),
  assignees, projects, filters, and a discussion thread (comments) on every task.
- **Projects** — per company, with member lists and progress bars.
- **Attachments & Documents** — attach files (max 20 MB) to any task; the Documents page
  lists every file in the company. Files are stored on your own server disk (`UPLOAD_DIR`)
  and downloads require login.
- **Discussion** — company-wide chat visible to all employees across the three companies.
- **Email notifications** — via your Gmail SMTP app password: employees get an email when a
  task is assigned to them and when someone comments on their task. If SMTP is not
  configured the app simply skips sending — nothing breaks.
- **Time sheet** — employees log hours against tasks/projects; weekly and 30-day totals.
- **Notes** — private personal notes.
- **Reports** — task and hour summaries per employee and per project
  (employees see only their own; managers/admins see everyone).
- **Admin panel** — create/edit/deactivate users, reset passwords, manage departments.
  Deactivated users cannot log in but their history is kept.

## Tech stack

Next.js 14 (App Router, server actions) · TypeScript · Tailwind CSS · Prisma · SQLite · JWT cookie auth (bcrypt-hashed passwords). No external services required.

## Getting started

```bash
npm install
npm run setup     # generates Prisma client, creates the SQLite DB, seeds data
npm run dev       # development — http://localhost:3000
```

For production:

```bash
npm run build
npm start
```

### Seeded data

- Companies: Looms & Berries India (IND), UAE (UAE), Saudi Arabia (KSA)
- Admin account: `sales@loomsberries.com` / `Admin@12345`
  (you are forced to change this on first login)

Override the seed admin with `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars before running `npm run db:seed`.

## Configuration (`.env`)

| Variable       | Purpose                                              |
| -------------- | ---------------------------------------------------- |
| `DATABASE_URL` | SQLite file location, e.g. `file:./dev.db`           |
| `AUTH_SECRET`  | Secret for signing session cookies — **set a long random value in production** |
| `APP_URL`      | Public URL used in email links, e.g. `https://tasks.donetella.com` |
| `UPLOAD_DIR`   | Folder on the server where attachments are stored (default `./uploads`) |
| `SMTP_HOST` / `SMTP_PORT` | SMTP server — for Gmail: `smtp.gmail.com` / `465` |
| `SMTP_USER` / `SMTP_PASS` | Gmail address and its **App Password**. Leave empty to disable email |
| `SMTP_FROM`    | From header, e.g. `Looms & Berries Tasks <you@gmail.com>` |

### Getting a Gmail App Password

1. Google Account → Security → turn on **2-Step Verification** (required).
2. Security → **App passwords** → create one for "Mail".
3. Put the 16-character password in `SMTP_PASS` (no spaces) and your Gmail address in `SMTP_USER`.

## Deployment on tasks.donetella.com (same pattern as the b2b app)

1. Install Node.js 20+ on the server.
2. Clone the repo, copy `.env.example` to `.env` and fill in `AUTH_SECRET`
   (e.g. `openssl rand -hex 32`), `APP_URL=https://tasks.donetella.com`, `UPLOAD_DIR`,
   and the SMTP values.
3. `npm install && npm run setup && npm run build`.
4. Create a systemd service (like the b2b app):

   ```ini
   [Unit]
   Description=Looms & Berries Task Manager
   After=network.target

   [Service]
   WorkingDirectory=/path/to/task_manager
   ExecStart=/usr/bin/npm start
   Restart=always
   EnvironmentFile=/path/to/task_manager/.env

   [Install]
   WantedBy=multi-user.target
   ```

   `sudo systemctl enable --now task-manager`

5. Point nginx at it with HTTPS (the app listens on port 3000; use `PORT=xxxx` in the
   service `Environment=` to change it):

   ```nginx
   server {
     server_name tasks.donetella.com;
     client_max_body_size 25m;   # needed for file uploads
     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```

6. Back up regularly: the SQLite file (`prisma/prod.db`) **and** the uploads folder
   (`UPLOAD_DIR`) — together they are your whole data.

## Admin workflow for onboarding the team

1. Log in as admin → **Departments** → add your departments per company.
2. **Users → Add User** → enter name, company email, a temporary password, role, company, department.
3. Share the temporary password with the employee — they must change it the first time they sign in.
4. To offboard someone, use **Deactivate** on the Users page (login is blocked instantly, history preserved).
