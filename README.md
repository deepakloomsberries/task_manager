# Looms & Berries — Task Manager

In-house task management app for all Looms & Berries employees (India, UAE, Saudi Arabia).
Built to replace TaskoPad — no per-user subscription, fully self-hosted.

## Features

- **Login with company email** — accounts are created by the admin; there is no self sign-up.
  Every new user gets a temporary password and is forced to change it on first login.
- **Roles** — Admin (full access), Manager (projects + team reports), Employee.
- **Dashboard** — my open / overdue / due-this-week / completed tasks, recent activity, active projects.
- **Tasks** — priorities, due dates, statuses (To Do → In Progress → In Review → Done),
  assignees, projects, filters, and a discussion thread (comments) on every task.
- **Projects** — per company, with member lists and progress bars.
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

## Deployment (any small VPS)

1. Install Node.js 20+.
2. Clone the repo, create `.env` with a strong `AUTH_SECRET` and `DATABASE_URL="file:./prod.db"`.
3. `npm install && npm run setup && npm run build`.
4. Run `npm start` behind a reverse proxy (nginx/Caddy) with HTTPS. A process manager
   such as `pm2` keeps it running: `pm2 start npm --name tasks -- start`.
5. Back up the SQLite file (`prisma/prod.db`) regularly — that file is your whole database.

## Admin workflow for onboarding the team

1. Log in as admin → **Departments** → add your departments per company.
2. **Users → Add User** → enter name, company email, a temporary password, role, company, department.
3. Share the temporary password with the employee — they must change it the first time they sign in.
4. To offboard someone, use **Deactivate** on the Users page (login is blocked instantly, history preserved).
