import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { backdatedStart, MAX_BACKDATE_MIN } from "@/lib/timers";
import { startTimerFor } from "@/lib/timers";
import { hoursAgo, makeTask, makeUser } from "./helpers";

const now = new Date("2026-09-24T12:00:00Z");

describe("backdatedStart", () => {
  it("counts back the given minutes", () => {
    expect(backdatedStart(30, now).toISOString()).toBe("2026-09-24T11:30:00.000Z");
  });

  it("treats junk, zero and negatives as now", () => {
    for (const v of [undefined, "", "abc", 0, -5, NaN]) expect(backdatedStart(v, now).getTime()).toBe(now.getTime());
  });

  it("caps how far back it can go", () => {
    expect(now.getTime() - backdatedStart(10_000, now).getTime()).toBe(MAX_BACKDATE_MIN * 60_000);
  });

  it("never starts before the timer being switched away from", () => {
    const other = new Date("2026-09-24T11:50:00Z");
    expect(backdatedStart(30, now, other).toISOString()).toBe(other.toISOString());
  });
});

describe("startTimerFor with a backdated start", () => {
  beforeEach(async () => {
    await db.taskTimer.deleteMany();
    await db.timeEntry.deleteMany();
  });

  it("starts the new timer in the past and banks the old one up to that moment", async () => {
    const u = await makeUser();
    const a = await makeTask(u.id);
    const b = await makeTask(u.id);
    await db.taskTimer.create({ data: { userId: u.id, taskId: a.id, startedAt: hoursAgo(2) } });

    await startTimerFor(u.id, b.id, 30);

    const timer = await db.taskTimer.findUniqueOrThrow({ where: { userId: u.id } });
    expect(timer.taskId).toBe(b.id);
    expect((Date.now() - timer.startedAt.getTime()) / 60_000).toBeCloseTo(30, 0);
    const banked = await db.timeEntry.findFirstOrThrow({ where: { userId: u.id, taskId: a.id } });
    expect(banked.hours).toBeCloseTo(1.5, 1);
  });

  it("is a no-op when already timing that task", async () => {
    const u = await makeUser();
    const a = await makeTask(u.id);
    const started = hoursAgo(1);
    await db.taskTimer.create({ data: { userId: u.id, taskId: a.id, startedAt: started } });
    await startTimerFor(u.id, a.id, 120);
    const timer = await db.taskTimer.findUniqueOrThrow({ where: { userId: u.id } });
    expect(timer.startedAt.getTime()).toBe(started.getTime());
  });
});
