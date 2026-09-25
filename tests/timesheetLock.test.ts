import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { weekLocked } from "@/lib/timesheetLock";
import { weekStartOf } from "@/lib/timerange";
import { makeUser } from "./helpers";

describe("weekStartOf", () => {
  it("returns the Sunday 00:00 of the week", () => {
    const s = weekStartOf(new Date(2026, 8, 24, 15, 30)); // Thu 24 Sep 2026
    expect([s.getFullYear(), s.getMonth(), s.getDate(), s.getDay(), s.getHours()]).toEqual([2026, 8, 20, 0, 0]);
  });

  it("is idempotent on a Sunday and accepts date strings", () => {
    const sun = weekStartOf(new Date(2026, 8, 20, 0, 0));
    expect(weekStartOf(sun).getTime()).toBe(sun.getTime());
    expect(weekStartOf("2026-09-26").getTime()).toBe(sun.getTime()); // Saturday
  });
});

describe("weekLocked", () => {
  const thursday = new Date(2026, 8, 24, 12);

  async function submit(userId: number, status: string) {
    return db.timesheetSubmission.create({
      data: { userId, weekStart: weekStartOf(thursday), totalHours: 40, status },
    });
  }

  it("is unlocked with no submission", async () => {
    const u = await makeUser();
    expect(await weekLocked(u.id, thursday)).toBe(false);
  });

  it.each([
    ["SUBMITTED", true],
    ["APPROVED", true],
    ["REJECTED", false],
  ])("status %s → locked=%s", async (status, locked) => {
    const u = await makeUser();
    await submit(u.id, status);
    expect(await weekLocked(u.id, thursday)).toBe(locked);
  });

  it("locks every day of that week and only that week", async () => {
    const u = await makeUser();
    await submit(u.id, "SUBMITTED");
    expect(await weekLocked(u.id, new Date(2026, 8, 20, 0, 1))).toBe(true); // Sunday
    expect(await weekLocked(u.id, new Date(2026, 8, 26, 23, 59))).toBe(true); // Saturday
    expect(await weekLocked(u.id, new Date(2026, 8, 27, 9))).toBe(false); // next Sunday
    expect(await weekLocked(u.id, new Date(2026, 8, 19, 9))).toBe(false); // previous Saturday
  });

  it("is per user", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await submit(a.id, "APPROVED");
    expect(await weekLocked(b.id, thursday)).toBe(false);
  });
});
