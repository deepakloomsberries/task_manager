import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { daysOffMap, holidaySet, leaveBetween, usersOnLeave, workingDaysFor } from "@/lib/leaveData";
import { findTimesheetReminders } from "@/lib/timesheetReminder";
import { makeUser } from "./helpers";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

async function leave(userId: number, start: string, end: string, status = "APPROVED", extra: object = {}) {
  return db.leave.create({ data: { userId, startDate: d(start), endDate: d(end), status, days: 1, ...extra } });
}

describe("leave data", () => {
  it("counts working days with the person's own office weekend and holidays", async () => {
    const u = await makeUser();
    await db.company.update({ where: { id: u.companyId }, data: { weekendDays: "5,6" } }); // Fri+Sat off
    await db.holiday.create({ data: { date: d("2031-03-04"), name: "Office day off", companyId: u.companyId } });
    await db.holiday.create({ data: { date: d("2031-03-05"), name: "Somewhere else", companyId: null } });
    // Sun 2 → Sat 8 Mar 2031: Sun, Mon, (Tue holiday), (Wed all-office holiday), Thu, (Fri, Sat weekend) = 3
    expect(await workingDaysFor(u.id, "2031-03-02", "2031-03-08", false)).toBe(3);
    expect(Array.from(await holidaySet(u.companyId, "2031-03-01", "2031-03-31")).sort()).toEqual(["2031-03-04", "2031-03-05"]);
  });

  it("finds only approved leave by default, overlapping the range", async () => {
    const u = await makeUser();
    await leave(u.id, "2031-04-01", "2031-04-03");
    await leave(u.id, "2031-04-10", "2031-04-11", "PENDING");
    expect((await leaveBetween("2031-04-03", "2031-04-20", { userIds: [u.id] })).length).toBe(1);
    expect((await leaveBetween("2031-04-03", "2031-04-20", { userIds: [u.id], statuses: ["APPROVED", "PENDING"] })).length).toBe(2);
    expect((await usersOnLeave("2031-04-02")).has(u.id)).toBe(true);
    expect((await usersOnLeave("2031-04-10")).has(u.id)).toBe(false);
  });

  it("maps each person's days off, leave winning over a holiday on the same day", async () => {
    const u = await makeUser();
    await db.holiday.create({ data: { date: d("2031-05-01"), name: "May Day", companyId: u.companyId } });
    await leave(u.id, "2031-05-01", "2031-05-02", "APPROVED", { type: "SICK" });
    const off = await daysOffMap([{ id: u.id, companyId: u.companyId }], "2031-05-01", "2031-05-03");
    expect(off.get(`${u.id}:2031-05-01`)).toMatchObject({ kind: "leave", type: "SICK" });
    expect(off.get(`${u.id}:2031-05-02`)).toMatchObject({ kind: "leave" });
    expect(off.has(`${u.id}:2031-05-03`)).toBe(false);
  });

  it("doesn't send the Friday timesheet reminder to someone on leave that day", async () => {
    await db.user.updateMany({ data: { active: false } });
    const away = await makeUser();
    const here = await makeUser();
    const friday = new Date(2031, 5, 6, 16); // Fri 6 Jun 2031, local time
    await leave(away.id, "2031-06-06", "2031-06-06");
    const ids = (await findTimesheetReminders(friday)).map((r) => r.userId);
    expect(ids).toContain(here.id);
    expect(ids).not.toContain(away.id);
  });
});
