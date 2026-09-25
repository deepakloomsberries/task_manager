import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { buildDigestEmail, gatherDigests } from "@/lib/dailyDigest";
import { leaveAnnouncementFor } from "@/lib/leaveAnnounce";
import { makeUser } from "./helpers";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
// Wed 15 Jun 2033, 08:30 in India — far from other tests' dates.
const NOW = new Date("2033-06-15T03:00:00Z");

const empty = { name: "Asha Rao", overdue: [], dueToday: [], toReview: [], pendingLeave: 0, pendingTimesheets: 0, offToday: [], offSoon: [] };

describe("daily digest email", () => {
  it("sends nothing when there's nothing to say", () => {
    expect(buildDigestEmail(empty)).toBeNull();
  });

  it("lists who's off and escapes names", () => {
    const mail = buildDigestEmail({ ...empty, offToday: [{ name: "Ravi <b>", office: "IND", range: "15–16 Jun", halfDay: true }] })!;
    expect(mail.subject).toContain("1 off today");
    expect(mail.html).toContain("Ravi &lt;b&gt;");
    expect(mail.html).toContain("half day");
    expect(mail.html).toContain("Good morning Asha");
  });

  it("gathers tasks, reviews and leave per person, and skips people who are off", async () => {
    const me = await makeUser({ role: "MANAGER" });
    const colleague = await makeUser();
    const away = await makeUser();
    const optedOut = await makeUser({ dailyDigest: false });

    await db.task.create({ data: { title: "Late one", createdById: me.id, assigneeId: me.id, dueDate: new Date("2033-06-10T10:00:00Z") } });
    await db.task.create({ data: { title: "Today one", createdById: me.id, assigneeId: colleague.id, dueDate: new Date("2033-06-15T10:00:00Z") } });
    await db.task.create({ data: { title: "Check this", createdById: me.id, assigneeId: colleague.id, status: "REVIEW" } });
    await db.task.create({ data: { title: "Later", createdById: me.id, assigneeId: me.id, dueDate: new Date("2033-06-25T10:00:00Z") } });
    await db.leave.create({ data: { userId: away.id, startDate: d("2033-06-14"), endDate: d("2033-06-16"), status: "APPROVED", days: 3 } });
    await db.leave.create({ data: { userId: colleague.id, startDate: d("2033-06-20"), endDate: d("2033-06-20"), status: "APPROVED", days: 1 } });
    await db.leave.create({ data: { userId: colleague.id, startDate: d("2033-07-20"), endDate: d("2033-07-20"), status: "PENDING", days: 1 } });

    const all = await gatherDigests(NOW);
    const mine = all.find((x) => x.userId === me.id)!;
    expect(mine.html).toContain("Late one");
    expect(mine.html).not.toContain("Today one"); // not mine
    expect(mine.html).not.toContain("Later");
    expect(mine.html).toContain("Check this");
    expect(mine.html).toMatch(/leave request/);
    expect(mine.html).toContain(away.name); // off today
    expect(mine.html).toContain(colleague.name); // off this week

    expect(all.find((x) => x.userId === colleague.id)!.html).toContain("Today one");
    expect(all.some((x) => x.userId === away.id)).toBe(false); // on leave today
    expect(all.some((x) => x.userId === optedOut.id)).toBe(false);
  });

  it("skips everyone on their office's weekend", async () => {
    const u = await makeUser();
    await db.company.update({ where: { id: u.companyId }, data: { weekendDays: "3" } }); // Wednesday off
    await db.task.create({ data: { title: "Due", createdById: u.id, assigneeId: u.id, dueDate: new Date("2033-06-15T10:00:00Z") } });
    expect((await gatherDigests(NOW)).some((x) => x.userId === u.id)).toBe(false);
  });
});

describe("leave announcement", () => {
  it("goes to everyone else with email on, and not for leave that's over", async () => {
    const u = await makeUser();
    const other = await makeUser();
    const quiet = await makeUser({ emailNotifications: false });
    const leave = await db.leave.create({ data: { userId: u.id, startDate: d("2033-06-20"), endDate: d("2033-06-21"), status: "APPROVED", days: 2 } });
    const a = (await leaveAnnouncementFor(leave.id, NOW))!;
    expect(a.to).toContain(other.email);
    expect(a.to).not.toContain(u.email);
    expect(a.to).not.toContain(quiet.email);
    expect(a.range).toBe("20–21 Jun");
    expect(await leaveAnnouncementFor(leave.id, new Date("2033-07-01T03:00:00Z"))).toBeNull();
  });
});
