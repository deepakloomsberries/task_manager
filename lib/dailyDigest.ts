import { db } from "@/lib/db";
import { emailShell } from "@/lib/mail";
import { eachDay, fmtRange, isWorkingDay, todayIn, weekendSet, ymd } from "@/lib/leave";
import { companyTimezone } from "@/lib/tz";

/**
 * The morning digest: one email per person with what needs them today —
 * overdue and due-today tasks, work waiting for their sign-off, and who's off
 * today and this week. Nobody gets it on their own day off.
 */

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
/** How far ahead "off this week" looks (days after today). */
export const UPCOMING_DAYS = 7;

type TaskLine = { id: number; title: string; project: string | null; due: Date };
type OffLine = { name: string; office: string; range: string; halfDay: boolean };

export type DigestInput = {
  name: string;
  overdue: TaskLine[];
  dueToday: TaskLine[];
  toReview: { id: number; title: string; by: string | null }[];
  pendingLeave: number;
  pendingTimesheets: number;
  offToday: OffLine[];
  offSoon: (OffLine & { from: string })[];
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function section(title: string, color: string, items: string[]) {
  if (!items.length) return "";
  return `<h3 style="margin:18px 0 4px;color:${color};font-size:15px">${title}</h3><ul style="margin:0;padding-left:18px;font-size:14px;color:#334155">${items
    .map((i) => `<li style="margin:4px 0">${i}</li>`)
    .join("")}</ul>`;
}

const taskLink = (id: number, title: string) =>
  `<a href="${APP_URL}/tasks/${id}" style="color:#0369a1;text-decoration:none">${esc(title)}</a>`;

/** Builds the email, or null when there's nothing worth sending. */
export function buildDigestEmail(d: DigestInput): { subject: string; html: string } | null {
  const approvals = d.toReview.length + d.pendingLeave + d.pendingTimesheets;
  if (!d.overdue.length && !d.dueToday.length && !approvals && !d.offToday.length && !d.offSoon.length) return null;

  const task = (t: TaskLine) =>
    `${taskLink(t.id, t.title)}${t.project ? ` <span style="color:#94a3b8">· ${esc(t.project)}</span>` : ""} <span style="color:#94a3b8">· due ${t.due.toLocaleDateString("en-GB")}</span>`;
  const off = (o: OffLine) => `<b>${esc(o.name)}</b> <span style="color:#94a3b8">(${esc(o.office)})</span> — ${esc(o.range)}${o.halfDay ? " · half day" : ""}`;

  const waiting = [
    ...d.toReview.map((t) => `${taskLink(t.id, t.title)} <span style="color:#94a3b8">· sent for review${t.by ? ` by ${esc(t.by)}` : ""}</span>`),
    ...(d.pendingLeave ? [`<a href="${APP_URL}/leave/team" style="color:#0369a1;text-decoration:none">${plural(d.pendingLeave, "leave request")}</a> to approve`] : []),
    ...(d.pendingTimesheets
      ? [`<a href="${APP_URL}/timesheet/team" style="color:#0369a1;text-decoration:none">${plural(d.pendingTimesheets, "timesheet")}</a> to approve`]
      : []),
  ];

  const body = [
    section(`🔴 Overdue (${d.overdue.length})`, "#dc2626", d.overdue.map(task)),
    section(`🟠 Due today (${d.dueToday.length})`, "#d97706", d.dueToday.map(task)),
    section(`✅ Waiting on you (${approvals})`, "#0369a1", waiting),
    section(`🌴 Off today (${d.offToday.length})`, "#059669", d.offToday.map(off)),
    section(`📅 Off this week`, "#64748b", d.offSoon.map(off)),
  ].join("");

  const bits = [
    d.overdue.length && `${d.overdue.length} overdue`,
    d.dueToday.length && `${d.dueToday.length} due today`,
    approvals && `${approvals} waiting on you`,
    d.offToday.length && `${d.offToday.length} off today`,
  ].filter(Boolean);
  const subject = `☀️ Your day: ${bits.length ? bits.join(", ") : "who's off this week"}`;

  const footer = `<p style="margin:16px 0 0;font-size:12px;color:#94a3b8">Turn this email off in Settings → Notifications.</p>`;
  const html = emailShell(`Good morning ${esc(d.name.split(" ")[0])}`, [], `${APP_URL}/my-tasks`, "Open My Tasks", body + footer);
  return { subject, html };
}

/** Everyone's digest for this morning. */
export async function gatherDigests(now: Date = new Date()) {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  // A window wide enough for every office's "today" plus the week ahead.
  const from = ymd(new Date(now.getTime() - 86400000));
  const to = ymd(new Date(now.getTime() + (UPCOMING_DAYS + 1) * 86400000));

  const [users, tasks, reviews, leaves, holidays, pendingLeave, pendingTimesheets] = await Promise.all([
    db.user.findMany({
      where: { active: true, emailNotifications: true, dailyDigest: true },
      include: { company: true },
    }),
    db.task.findMany({
      where: { status: { not: "DONE" }, deletedAt: null, seriesId: null, dueDate: { lt: todayEnd } },
      select: {
        id: true,
        title: true,
        dueDate: true,
        assigneeId: true,
        project: { select: { name: true } },
        collaborators: { select: { userId: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
    db.task.findMany({
      where: { status: "REVIEW", deletedAt: null },
      select: { id: true, title: true, createdById: true, assigneeId: true, assignee: { select: { name: true } } },
    }),
    db.leave.findMany({
      where: { status: "APPROVED", startDate: { lte: new Date(`${to}T00:00:00Z`) }, endDate: { gte: new Date(`${from}T00:00:00Z`) } },
      include: { user: { select: { id: true, name: true, active: true, company: { select: { code: true } } } } },
      orderBy: { startDate: "asc" },
    }),
    db.holiday.findMany({ where: { date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } } }),
    db.leave.groupBy({ by: ["userId"], where: { status: "PENDING" }, _count: true }),
    db.timesheetSubmission.count({ where: { status: "SUBMITTED" } }),
  ]);

  const out: { userId: number; email: string; subject: string; html: string }[] = [];
  for (const u of users) {
    const today = todayIn(companyTimezone(u.company), now);
    const officeHolidays = new Set(holidays.filter((h) => h.companyId === null || h.companyId === u.companyId).map((h) => ymd(h.date)));
    // Their own day off: weekend, office holiday or leave — no email.
    if (!isWorkingDay(today, weekendSet(u.company.weekendDays), officeHolidays)) continue;
    if (leaves.some((l) => l.userId === u.id && ymd(l.startDate) <= today && ymd(l.endDate) >= today && !l.halfDay)) continue;

    const mine = tasks.filter((t) => t.assigneeId === u.id || t.collaborators.some((c) => c.userId === u.id));
    const line = (t: (typeof tasks)[number]) => ({ id: t.id, title: t.title, project: t.project?.name ?? null, due: t.dueDate! });
    const isManager = u.role === "ADMIN" || u.role === "MANAGER";
    const soonEnd = eachDay(today, to)[UPCOMING_DAYS] ?? to;
    const others = leaves.filter((l) => l.userId !== u.id && l.user.active);

    const input: DigestInput = {
      name: u.name,
      overdue: mine.filter((t) => t.dueDate! < todayStart).map(line),
      dueToday: mine.filter((t) => t.dueDate! >= todayStart).map(line),
      toReview: reviews
        .filter((t) => t.createdById === u.id && t.assigneeId !== u.id)
        .map((t) => ({ id: t.id, title: t.title, by: t.assignee?.name ?? null })),
      pendingLeave: isManager ? pendingLeave.filter((p) => p.userId !== u.id).reduce((s, p) => s + p._count, 0) : 0,
      pendingTimesheets: isManager ? pendingTimesheets : 0,
      offToday: others
        .filter((l) => ymd(l.startDate) <= today && ymd(l.endDate) >= today)
        .map((l) => ({ name: l.user.name, office: l.user.company.code, range: fmtRange(l.startDate, l.endDate), halfDay: l.halfDay })),
      offSoon: others
        .filter((l) => ymd(l.startDate) > today && ymd(l.startDate) <= soonEnd)
        .map((l) => ({
          name: l.user.name,
          office: l.user.company.code,
          range: fmtRange(l.startDate, l.endDate),
          halfDay: l.halfDay,
          from: ymd(l.startDate),
        })),
    };
    const mail = buildDigestEmail(input);
    if (mail) out.push({ userId: u.id, email: u.email, ...mail });
  }
  return out;
}
