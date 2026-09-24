import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findTimesheetReminders, REMINDER_PREFIX } from "@/lib/timesheetReminder";
import { weekStartOf } from "@/lib/timerange";
import { makeUser } from "./helpers";

const friday = new Date(2026, 8, 25, 16, 0);

beforeEach(async () => {
  await db.user.updateMany({ data: { active: false } });
  await db.notification.deleteMany();
});

describe("findTimesheetReminders", () => {
  it("reminds people whose week isn't submitted, with their hours", async () => {
    const logged = await makeUser();
    const idle = await makeUser();
    await db.timeEntry.create({ data: { userId: logged.id, date: new Date(2026, 8, 23), hours: 6.5 } });

    const r = await findTimesheetReminders(friday);
    const byUser = new Map(r.map((x) => [x.userId, x]));
    expect(byUser.get(logged.id)?.hours).toBe(6.5);
    expect(byUser.get(logged.id)?.message).toContain("6h 30m");
    expect(byUser.get(idle.id)?.message).toContain("haven't logged any time");
  });

  it("skips submitted/approved weeks but not rejected ones", async () => {
    const [sub, app, rej] = [await makeUser(), await makeUser(), await makeUser()];
    const weekStart = weekStartOf(friday);
    await db.timesheetSubmission.createMany({
      data: [
        { userId: sub.id, weekStart, status: "SUBMITTED" },
        { userId: app.id, weekStart, status: "APPROVED" },
        { userId: rej.id, weekStart, status: "REJECTED" },
      ],
    });
    const ids = (await findTimesheetReminders(friday)).map((r) => r.userId);
    expect(ids).toContain(rej.id);
    expect(ids).not.toContain(sub.id);
    expect(ids).not.toContain(app.id);
  });

  it("doesn't remind the same person twice in a day, and respects roles", async () => {
    const u = await makeUser();
    const admin = await makeUser({ role: "ADMIN" });
    await db.notification.create({ data: { userId: u.id, message: `${REMINDER_PREFIX}: earlier`, createdAt: new Date(2026, 8, 25, 9) } });
    const ids = (await findTimesheetReminders(friday)).map((r) => r.userId);
    expect(ids).not.toContain(u.id);
    expect(ids).not.toContain(admin.id);
  });
});
