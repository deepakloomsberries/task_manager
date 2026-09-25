/**
 * Seeds a throwaway database with FICTIONAL demo data, used only to capture the
 * screenshots for the public /use guide (see scripts/guide/capture.mjs).
 * Never run this against the production database.
 *
 *   DATABASE_URL="file:/tmp/guide.db" npx prisma db push --skip-generate
 *   DATABASE_URL="file:/tmp/guide.db" npx tsx scripts/guide/seed-demo.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

if (!/guide|demo|tmp/i.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing to seed: DATABASE_URL must point at a throwaway guide/demo/tmp database.");
  process.exit(1);
}

const db = new PrismaClient();
const DAY = 86_400_000;
const at = (days: number, hour = 10, min = 0) => {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, min, 0, 0);
  return d;
};
const dateOnly = (days: number) => {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(0, 0, 0, 0);
  return d;
};

async function main() {
  const hash = await bcrypt.hash("Demo@12345", 10);
  const [ind, uae, ksa] = await Promise.all(
    [
      { name: "Looms & Berries India", code: "IND" },
      { name: "Looms & Berries UAE", code: "UAE" },
      { name: "Looms & Berries Saudi Arabia", code: "KSA" },
    ].map((c) => db.company.create({ data: c }))
  );
  const dept = async (name: string, companyId: number) => db.department.create({ data: { name, companyId } });
  const mkt = await dept("Marketing", ind.id);
  const ops = await dept("Operations", uae.id);
  const acc = await dept("Accounts", ksa.id);
  const lst = await dept("Listing", uae.id);
  const data = await dept("Data", ind.id);

  const user = (name: string, email: string, role: string, companyId: number, departmentId: number, jobTitle: string, seen = 0) =>
    db.user.create({
      data: {
        name, email, role, companyId, departmentId, jobTitle, passwordHash: hash,
        mustChangePassword: false, lastSeenAt: seen >= 0 ? new Date(Date.now() - seen * 60_000) : null,
        preferredLanguage: "en",
      },
    });
  const priya = await user("Priya Menon", "priya@demo.local", "ADMIN", ind.id, mkt.id, "Operations Head", 0);
  const arjun = await user("Arjun Rao", "arjun@demo.local", "MANAGER", ind.id, mkt.id, "Marketing Manager", 1);
  const karan = await user("Karan Fernandes", "karan@demo.local", "EMPLOYEE", uae.id, ops.id, "Warehouse Lead", 2);
  const sara = await user("Sara Ahmed", "sara@demo.local", "EMPLOYEE", ksa.id, acc.id, "Accountant", 30);
  const fatima = await user("Fatima Noor", "fatima@demo.local", "EMPLOYEE", uae.id, lst.id, "Listing Executive", 0);
  const rohan = await user("Rohan Iyer", "rohan@demo.local", "EMPLOYEE", ind.id, data.id, "Data Analyst", 300);
  const people = [priya, arjun, karan, sara, fatima, rohan];
  for (const u of [priya, arjun, sara, fatima, rohan]) {
    await db.user.update({ where: { id: u.id }, data: { createdAt: new Date(Date.now() - 120 * DAY) } });
  }
  await db.user.update({ where: { id: karan.id }, data: { createdAt: new Date(Date.now() - 6 * DAY), preferredLanguage: null } });

  const project = async (name: string, description: string, companyId: number, members: number[], status = "ACTIVE") =>
    db.project.create({
      data: {
        name, description, companyId, status, createdById: priya.id,
        members: { create: members.map((userId) => ({ userId })) },
      },
    });
  const festive = await project("Festive Season Launch", "Catalogue, campaigns and stock readiness for the Diwali & Eid festive season.", ind.id, [priya.id, arjun.id, karan.id, fatima.id]);
  const amazon = await project("Marketplace Listing Refresh", "Rewrite titles, images and A+ content for the top 200 SKUs.", uae.id, [fatima.id, rohan.id, arjun.id]);
  const audit = await project("Q4 Vendor Audit", "Reconcile vendor invoices and close open POs before quarter end.", ksa.id, [sara.id, priya.id]);
  await project("Website Redesign", "New storefront theme and checkout.", ind.id, [arjun.id, rohan.id], "ON_HOLD");

  type T = {
    title: string; status?: string; priority?: string; due?: number; assignee?: number; project?: number;
    est?: number; description?: string; recurrence?: string; parentId?: number; collab?: number[]; start?: number;
  };
  const task = async (t: T) =>
    db.task.create({
      data: {
        title: t.title, status: t.status ?? "TODO", priority: t.priority ?? "MEDIUM",
        dueDate: t.due !== undefined ? at(t.due, 18) : null, startDate: t.start !== undefined ? at(t.start, 9) : null,
        assigneeId: t.assignee ?? null, projectId: t.project ?? null, createdById: priya.id,
        estimateHours: t.est ?? null, description: t.description ?? null, recurrence: t.recurrence ?? null,
        seriesId: t.recurrence ? `${t.recurrence}:${t.assignee ?? 0}:${t.title.toLowerCase()}` : null,
        parentId: t.parentId ?? null, completedAt: t.status === "DONE" ? at(-1, 16) : null,
        acknowledgedAt: at(-2),
        collaborators: t.collab ? { create: t.collab.map((userId) => ({ userId })) } : undefined,
        createdAt: at(-3),
      },
    });

  const t1 = await task({
    title: "Finalise festive catalogue photography", status: "IN_PROGRESS", priority: "HIGH", due: 1, assignee: karan.id,
    project: festive.id, est: 24, start: -2, collab: [fatima.id],
    description: "Shoot the 40 hero SKUs on white + lifestyle backgrounds.\n\n- Use the new lightbox in the studio\n- Export 2000×2000 JPGs to the shared Drive\n- Tag Fatima when images are ready for listing",
  });
  await task({ title: "Draft social media campaign calendar", status: "IN_PROGRESS", priority: "MEDIUM", due: 3, assignee: arjun.id, project: festive.id, est: 4 });
  const t3 = await task({ title: "Reconcile October vendor invoices", status: "REVIEW", priority: "URGENT", due: 0, assignee: sara.id, project: audit.id, est: 40 });
  await task({ title: "Warehouse stock count — Riyadh hub", status: "TODO", priority: "MEDIUM", due: 5, assignee: karan.id, project: festive.id, est: 8 });
  await task({ title: "Customer FAQ translation pass", status: "DONE", priority: "LOW", due: -1, assignee: fatima.id, project: festive.id, est: 2 });
  await task({ title: "Approve influencer shortlist", status: "TODO", priority: "HIGH", due: 2, assignee: priya.id, project: festive.id, est: 1 });
  await task({ title: "Rewrite titles for top 50 SKUs", status: "IN_PROGRESS", priority: "HIGH", due: 4, assignee: fatima.id, project: amazon.id, est: 10 });
  await task({ title: "Pull return-rate report by category", status: "TODO", priority: "MEDIUM", due: -2, assignee: rohan.id, project: amazon.id, est: 3 });
  await task({ title: "Close open purchase orders", status: "TODO", priority: "HIGH", due: 6, assignee: sara.id, project: audit.id, est: 4 });
  await task({ title: "Update A+ content templates", status: "TODO", priority: "LOW", due: 9, assignee: fatima.id, project: amazon.id, est: 3 });
  await task({ title: "Daily sales report", status: "TODO", priority: "MEDIUM", due: 0, assignee: rohan.id, recurrence: "DAILY", est: 0.5 });
  await task({ title: "Weekly stock reconciliation", status: "TODO", priority: "MEDIUM", due: 3, assignee: karan.id, recurrence: "WEEKLY", est: 2 });
  await task({ title: "Monthly GST filing", status: "TODO", priority: "HIGH", due: 12, assignee: sara.id, recurrence: "MONTHLY", est: 3 });
  await task({ title: "Review campaign budget", status: "TODO", priority: "MEDIUM", due: 1, assignee: priya.id, project: festive.id, est: 1 });

  // Completed tasks with estimates + logged time, for "Estimates vs actual".
  const doneWithTime: [string, number, number, number][] = [
    ["Campaign brief for festive ads", arjun.id, 3, 2.5],
    ["Vendor master list cleanup", sara.id, 4, 6.5],
    ["Final price sheet to Accounts", priya.id, 1, 1],
    ["Size-chart images for kurtas", fatima.id, 2, 1.25],
  ];
  for (const [title, who, est, logged] of doneWithTime) {
    const dt = await task({ title, status: "DONE", priority: "MEDIUM", due: -2, assignee: who, project: festive.id, est });
    await db.timeEntry.create({
      data: { userId: who, taskId: dt.id, projectId: festive.id, date: dateOnly(-2), hours: logged, source: "timer" },
    });
  }

  // Tags, a dependency and a subtask checklist on the photography task.
  const tagPhoto = await db.tag.create({ data: { name: "photography", color: "purple" } });
  const tagFestive = await db.tag.create({ data: { name: "festive", color: "amber" } });
  await db.taskTag.createMany({ data: [{ taskId: t1.id, tagId: tagPhoto.id }, { taskId: t1.id, tagId: tagFestive.id }] });
  const studio = await task({ title: "Book studio & lightbox", status: "IN_PROGRESS", priority: "HIGH", due: 0, assignee: karan.id, project: festive.id, est: 1 });
  await db.taskDependency.create({ data: { taskId: t1.id, blockerId: studio.id } });

  // Something in the recycle bin.
  await task({ title: "Old Diwali banner draft (duplicate)", status: "TODO", assignee: arjun.id, project: festive.id }).then((d) =>
    db.task.update({ where: { id: d.id }, data: { deletedAt: at(-1, 15) } })
  );

  // A reusable project template.
  await db.projectTemplate.create({
    data: {
      name: "New marketplace launch",
      description: "Everything needed to list a new brand on a marketplace.",
      items: {
        create: [
          { title: "Create brand registry", priority: "HIGH", dueOffsetDays: 2, order: 0 },
          { title: "Shoot catalogue images", priority: "HIGH", dueOffsetDays: 7, order: 1 },
          { title: "Write titles & bullet points", priority: "MEDIUM", dueOffsetDays: 10, order: 2 },
          { title: "Set up pricing & inventory", priority: "MEDIUM", dueOffsetDays: 12, order: 3 },
          { title: "Go-live checklist", priority: "URGENT", dueOffsetDays: 14, order: 4 },
        ],
      },
    },
  });

  for (const [title, status] of [["Hero SKUs — white background", "DONE"], ["Lifestyle shots", "IN_PROGRESS"], ["Upload to shared Drive", "TODO"]] as const) {
    await task({ title, status, assignee: karan.id, project: festive.id, parentId: t1.id, due: 1 });
  }

  await db.taskComment.createMany({
    data: [
      { taskId: t1.id, authorId: karan.id, body: "White-background shots done for 28 of 40 SKUs. Lifestyle set tomorrow.", createdAt: at(-1, 17) },
      { taskId: t1.id, authorId: priya.id, body: "Great progress 👍 @Fatima Noor can start listing the finished ones.", createdAt: at(-1, 18) },
      { taskId: t1.id, authorId: fatima.id, body: "On it — will pick them up first thing.", createdAt: at(0, 9) },
      { taskId: t3.id, authorId: sara.id, body: "All invoices matched except two from BlueLine Logistics — flagged in the sheet.", createdAt: at(0, 11) },
    ],
  });
  await db.taskActivity.createMany({
    data: [
      { taskId: t1.id, actorId: priya.id, type: "created", createdAt: at(-3) },
      { taskId: t1.id, actorId: karan.id, type: "status", detail: "TODO → IN_PROGRESS (timer started)", createdAt: at(-2) },
      { taskId: t1.id, actorId: priya.id, type: "priority", detail: "MEDIUM → HIGH", createdAt: at(-1) },
    ],
  });

  // A week of time entries for the timesheet / reports / workload views.
  const entries: { u: number; d: number; h: number; task?: number; proj?: number; note?: string }[] = [];
  for (let d = -6; d <= 0; d++) {
    const dow = new Date(Date.now() + d * DAY).getDay();
    if (dow === 0) continue;
    entries.push({ u: priya.id, d, h: 2.5, proj: festive.id, note: "Campaign review" });
    entries.push({ u: karan.id, d, h: 5, task: t1.id, proj: festive.id });
    entries.push({ u: sara.id, d, h: 6, task: t3.id, proj: audit.id });
    entries.push({ u: fatima.id, d, h: 4.5, proj: amazon.id, note: "Listing copy" });
    entries.push({ u: arjun.id, d, h: 3, proj: festive.id });
    if (d % 2 === 0) entries.push({ u: rohan.id, d, h: 2, proj: amazon.id, note: "Return-rate analysis" });
  }
  for (const e of entries) {
    await db.timeEntry.create({
      data: {
        userId: e.u, date: dateOnly(e.d), hours: e.h, taskId: e.task ?? null, projectId: e.proj ?? null,
        note: e.note ?? null, startedAt: at(e.d, 10), endedAt: new Date(at(e.d, 10).getTime() + e.h * 3600_000),
        source: e.task ? "timer" : "manual",
      },
    });
  }
  // A couple of audit-trail rows so "Change history" has something to show.
  const karanEntry = await db.timeEntry.findFirstOrThrow({ where: { userId: karan.id }, orderBy: { date: "desc" } });
  const snap = (hours: number, note: string | null) =>
    JSON.stringify({ date: karanEntry.date.toISOString(), hours, taskId: t1.id, projectId: festive.id, note, startedAt: null, endedAt: null });
  await db.timeEntryAudit.createMany({
    data: [
      { timeEntryId: karanEntry.id, ownerId: karan.id, actorId: karan.id, action: "timer", before: null, after: snap(4, null), createdAt: at(0, 14) },
      { timeEntryId: karanEntry.id, ownerId: karan.id, actorId: karan.id, action: "update", before: snap(4, null), after: snap(5, "Included studio setup"), createdAt: at(0, 15) },
      { timeEntryId: 9999, ownerId: karan.id, actorId: null, action: "auto_stop", before: null, after: snap(1.5, null), createdAt: at(-1, 20) },
    ],
  });

  const weekStart = new Date(dateOnly(0));
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  await db.timesheetSubmission.create({ data: { userId: sara.id, weekStart, totalHours: 36, status: "SUBMITTED" } });
  await db.timesheetSubmission.create({ data: { userId: fatima.id, weekStart, totalHours: 27, status: "SUBMITTED" } });

  // Running timers (the "working now" chips). lastPingAt keeps them alive.
  await db.taskTimer.create({ data: { userId: karan.id, taskId: t1.id, startedAt: new Date(Date.now() - (4 * 60 + 22) * 60_000), lastPingAt: new Date() } });

  await db.note.createMany({
    data: [
      { userId: priya.id, title: "Festive launch checklist", type: "checklist", color: "yellow", pinned: true,
        body: "[x] Lock catalogue SKUs\n[x] Brief photography team\n[ ] Approve influencer list\n[ ] Final price sheet to Accounts\n[ ] Go-live on 1 Oct" },
      { userId: priya.id, title: "Vendor call notes", color: "blue", body: "BlueLine — agreed 45-day payment terms.\nFollow up on damaged-goods credit note." },
      { userId: priya.id, title: "Ideas", color: "green", body: "Bundle offers for gifting season.\nWhatsApp broadcast for repeat buyers." },
      { userId: priya.id, title: "Weekly 1:1 agenda", color: "purple", body: "- Hiring plan for Q4\n- Warehouse space in Riyadh\n- Review workload balance" },
    ],
  });

  const dm = (from: number, to: number, body: string, mins: number, extra: object = {}) =>
    db.directMessage.create({ data: { senderId: from, recipientId: to, body, read: true, createdAt: new Date(Date.now() - mins * 60_000), ...extra } });
  await dm(karan.id, priya.id, "Hi Priya, lifestyle shoot is booked for tomorrow 10am.", 95);
  await dm(priya.id, karan.id, "Perfect. Can you share the shot list before that?", 90);
  await dm(karan.id, priya.id, "Sure — sending it in 10 minutes.", 88);
  await dm(sara.id, priya.id, "مرحبا بريا، تمت مطابقة جميع الفواتير باستثناء فاتورتين.", 40, {
    translatedBody: "Hi Priya, all invoices are matched except two.", translatedLang: "en", translatedAt: new Date(),
  });
  await dm(priya.id, sara.id, "Thanks Sara! Which vendor are the two from?", 35);
  await dm(fatima.id, priya.id, "Listing copy for the first 20 SKUs is ready for review.", 12, { read: false });

  const group = await db.group.create({
    data: {
      name: "Festive launch squad", createdById: priya.id,
      members: { create: [priya, arjun, karan, fatima].map((u) => ({ userId: u.id })) },
    },
  });
  const gm = (senderId: number, body: string, mins: number) =>
    db.groupMessage.create({ data: { groupId: group.id, senderId, body, createdAt: new Date(Date.now() - mins * 60_000) } });
  await gm(priya.id, "Morning team! Launch is 7 days out — let's do a quick status round.", 180);
  await gm(arjun.id, "Campaign calendar 80% done, sharing the draft by EOD.", 170);
  await gm(karan.id, "Photography on track, 28/40 SKUs shot ✅", 160);
  await gm(fatima.id, "Listings will go live in batches as images come in.", 150);
  await db.group.create({
    data: { name: "Accounts KSA", createdById: sara.id, members: { create: [sara, priya].map((u) => ({ userId: u.id })) } },
  });

  await db.notification.createMany({
    data: [
      { userId: priya.id, message: "Sara Ahmed moved \"Reconcile October vendor invoices\" to Review", link: `/tasks/${t3.id}`, createdAt: at(0, 11) },
      { userId: priya.id, message: "Fatima Noor submitted their timesheet for week of this week", link: "/timesheet/team", createdAt: at(0, 10) },
      { userId: priya.id, message: "Karan Fernandes commented on \"Finalise festive catalogue photography\"", link: `/tasks/${t1.id}`, read: true, createdAt: at(-1, 17) },
    ],
  });

  // Documents: shared links (no files on disk needed).
  const links: [string, string, number | null, number][] = [
    ["Festive catalogue — final shot list.xlsx", "https://docs.google.com/spreadsheets/d/demo", t1.id, karan.id],
    ["Brand guidelines 2026.pdf", "https://drive.google.com/file/d/demo-brand", null, arjun.id],
    ["October vendor invoices.zip", "https://drive.google.com/file/d/demo-invoices", t3.id, sara.id],
    ["Influencer shortlist.pdf", "https://drive.google.com/file/d/demo-influencers", null, priya.id],
  ];
  for (const [originalName, externalUrl, taskId, uploadedById] of links) {
    await db.attachment.create({ data: { originalName, externalUrl, mimeType: "text/uri-list", size: 0, taskId, uploadedById, createdAt: at(-1, 12) } });
  }

  // Office weekends, holidays and a mix of leave for the Leave pages.
  await db.company.update({ where: { id: ind.id }, data: { weekendDays: "0" } });
  await db.company.update({ where: { id: uae.id }, data: { weekendDays: "0,6" } });
  await db.company.update({ where: { id: ksa.id }, data: { weekendDays: "5,6" } });
  const dayUtc = (days: number) => {
    const x = new Date(Date.now() + days * DAY);
    return new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()));
  };
  await db.holiday.createMany({
    data: [
      { date: dayUtc(7), name: "Gandhi Jayanti", companyId: ind.id },
      { date: dayUtc(14), name: "Company offsite", companyId: null },
      { date: dayUtc(25), name: "Dussehra", companyId: ind.id },
      { date: dayUtc(44), name: "Diwali", companyId: ind.id },
      { date: dayUtc(68), name: "UAE National Day", companyId: uae.id },
      { date: dayUtc(-2), name: "Saudi National Day", companyId: ksa.id },
    ],
  });
  const leave = (userId: number, from: number, to: number, type: string, status: string, days: number, extra: object = {}) =>
    db.leave.create({
      data: {
        userId, type, status, days, startDate: dayUtc(from), endDate: dayUtc(to), createdAt: at(-4),
        ...(status === "APPROVED" || status === "REJECTED" ? { reviewedById: priya.id, reviewedAt: at(-3) } : {}),
        ...extra,
      },
    });
  await leave(rohan.id, 0, 0, "SICK", "APPROVED", 1, { reason: "Fever" });
  await leave(karan.id, 3, 4, "ANNUAL", "APPROVED", 2, { reason: "Cousin's wedding" });
  await leave(arjun.id, 6, 8, "ANNUAL", "APPROVED", 3);
  await leave(sara.id, 10, 14, "ANNUAL", "PENDING", 3, { reason: "Family wedding in Jeddah" });
  await leave(fatima.id, 2, 2, "CASUAL", "PENDING", 0.5, { halfDay: true, reason: "Bank appointment" });
  await leave(fatima.id, -30, -28, "ANNUAL", "APPROVED", 3);
  await leave(fatima.id, -12, -12, "SICK", "APPROVED", 1);
  await leave(fatima.id, 20, 21, "ANNUAL", "APPROVED", 2, { reason: "Long weekend trip" });
  await leave(fatima.id, -50, -49, "UNPAID", "REJECTED", 2, { reviewNote: "Clashes with the stock audit" });
  await db.user.update({ where: { id: priya.id }, data: { calendarToken: "demo-calendar-link-3f9a0c7b2e41d8a6" } });

  // Presence: a couple of people with a status set.
  await db.user.update({ where: { id: arjun.id }, data: { presence: "MEETING", presenceText: "Buyer call till 4pm" } });
  await db.user.update({ where: { id: karan.id }, data: { presence: "BUSY", presenceText: "At the studio" } });

  // Client portal: a fictional buyer following the festive project.
  const client = await db.client.create({ data: { name: "Aurora Home Retail" } });
  await db.clientContact.create({
    data: { clientId: client.id, name: "Lena Brooks", email: "lena@demo.local", passwordHash: hash, mustChangePassword: false, lastSeenAt: at(0, 10) },
  });
  await db.project.update({ where: { id: festive.id }, data: { clientId: client.id } });
  await db.task.updateMany({ where: { projectId: festive.id, parentId: null }, data: { clientVisible: true } });
  const doneShared = await db.task.findMany({ where: { projectId: festive.id, status: "DONE", parentId: null }, orderBy: { id: "asc" } });
  if (doneShared[0]) {
    await db.task.update({ where: { id: doneShared[0].id }, data: { clientStatus: "APPROVED", clientStatusAt: at(-1, 15), clientStatusBy: "Lena Brooks" } });
  }
  await db.attachment.updateMany({ where: { taskId: t1.id }, data: { clientVisible: true } });
  const lena = await db.clientContact.findUniqueOrThrow({ where: { email: "lena@demo.local" } });
  await db.clientComment.createMany({
    data: [
      { taskId: t1.id, contactId: lena.id, body: "Could we see a few of the white-background shots before the full set?", createdAt: at(-1, 11) },
      { taskId: t1.id, userId: priya.id, body: "Of course — 28 of 40 are attached above. The rest follow tomorrow.", createdAt: at(-1, 12) },
    ],
  });

  console.log(`Demo data ready. Sign in as priya@demo.local / Demo@12345 (${people.length} people).`);
}

main().then(() => db.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
