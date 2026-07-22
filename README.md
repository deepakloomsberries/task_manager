# Looms & Berries — Task Manager

Internal task management application for Looms & Berries employees across all three
companies (India, UAE, Saudi Arabia). Fully self-hosted.

> **Operations runbook:** see **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the complete
> step-by-step guide — server installation (including `AUTH_SECRET` generation),
> updates, backups, server migration, troubleshooting, and administrator password
> recovery. Based on the production deployment on task.donetella.com.

## Features

- **Login with company email** — accounts are created by the admin; there is no self sign-up.
  Every new user gets a temporary password and is forced to change it on first login.
- **Roles** — Admin (full access), Manager (projects + team reports), Employee.
- **Dashboard** — my open / overdue / due-this-week / completed tasks, recent activity, active projects.
- **My Tasks** — personal work view grouped by urgency (Overdue / Due today / This week /
  Later) with one-click completion.
- **Tasks** — priorities, due dates, statuses (To Do → In Progress → In Review → Done),
  assignees, projects, subtasks with progress, colored tags, filters, a discussion
  thread on every task, and a per-task activity history.
- **Board view** — Kanban board with drag-and-drop between status columns.
- **Calendar** — month view of tasks by due date (own tasks or everyone).
- **Search** — global search across tasks, projects, documents, notes, and people.
- **Notifications** — in-app notification center (assignments, comments, completions)
  in addition to email.
- **Projects** — per company, with member lists and progress bars.
- **Project templates** — managers define a reusable task list once (with priorities and
  due-day offsets); new projects can start from a template, and any project can be saved
  as one.
- **Mobile app (PWA)** — installable on Android and iPhone home screens from the browser;
  runs full-screen like a native app.
- **Attachments & Documents** — attach files (max 20 MB) to any task; the Documents page
  lists every file in the company. Files are stored on your own server disk (`UPLOAD_DIR`)
  and downloads require login.
- **Discussion** — company-wide chat visible to all employees across the three companies.
- **Email notifications** — via Gmail SMTP app password: employees get an email when a
  task is assigned to them and when someone comments on their task. If SMTP is not
  configured the app simply skips sending — nothing breaks.
- **Daily reminder digest** — an optional scheduled job (`npm run reminders`) emails each
  employee a morning summary of their overdue and due-today tasks.
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
| `APP_URL`      | Public URL used in email links, e.g. `https://task.donetella.com` |
| `UPLOAD_DIR`   | Folder on the server where attachments are stored (default `./uploads`) |
| `SMTP_HOST` / `SMTP_PORT` | SMTP server — for Gmail: `smtp.gmail.com` / `465` |
| `SMTP_USER` / `SMTP_PASS` | Gmail address and its **App Password**. Leave empty to disable email |
| `SMTP_FROM`    | From header, e.g. `Looms & Berries Tasks <you@gmail.com>` |

### Getting a Gmail App Password

1. Google Account → Security → turn on **2-Step Verification** (required).
2. Security → **App passwords** → create one for "Mail".
3. Put the 16-character password in `SMTP_PASS` (no spaces) and your Gmail address in `SMTP_USER`.

## Deployment

The application is deployed as a systemd service (bound to 127.0.0.1) behind an
Apache reverse proxy with HTTPS. In outline:

1. Install Node.js 20+ (via NodeSource).
2. Clone the repository, create `.env` from `.env.example`, and set `AUTH_SECRET`
   (`openssl rand -hex 32`), `APP_URL`, `UPLOAD_DIR`, and the SMTP values.
3. `npm install && npm run setup && npm run build`.
4. Run as a systemd service; proxy through an Apache virtual host with
   `ProxyPreserveHost On` and obtain a certificate with `certbot --apache`.
5. Back up the SQLite database file and the `UPLOAD_DIR` folder — together they hold
   all application data.

**[DEPLOYMENT.md](./DEPLOYMENT.md) contains the complete runbook** with the exact
commands, service and Apache configuration files, backup automation, server migration
procedure, and troubleshooting reference.

## Admin workflow for onboarding the team

1. Log in as admin → **Departments** → add your departments per company.
2. **Users → Add User** → enter name, company email, a temporary password, role, company, department.
3. Share the temporary password with the employee — they must change it the first time they sign in.
4. To offboard someone, use **Deactivate** on the Users page (login is blocked instantly, history preserved).
