import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { commitTimer, reapStaleTimers, TIMER_STALE_MS } from "@/lib/timers";
import { hoursAgo, makeTask, makeUser } from "./helpers";

beforeEach(async () => {
  await db.taskTimer.deleteMany();
  await db.timeEntry.deleteMany();
  await db.timeEntryAudit.deleteMany();
});

describe("commitTimer", () => {
  it("logs elapsed time rounded to the minute and removes the timer", async () => {
    const u = await makeUser();
    const t = await makeTask(u.id);
    const timer = await db.taskTimer.create({ data: { userId: u.id, taskId: t.id, startedAt: hoursAgo(1.5) } });

    const hours = await commitTimer(timer);

    expect(hours).toBeCloseTo(1.5, 2);
    const entry = await db.timeEntry.findFirstOrThrow({ where: { userId: u.id } });
    expect(entry).toMatchObject({ source: "timer", taskId: t.id, hours });
    expect(await db.taskTimer.count({ where: { userId: u.id } })).toBe(0);
  });

  it("never logs a zero-length or negative entry", async () => {
    const u = await makeUser();
    const t = await makeTask(u.id);
    const timer = await db.taskTimer.create({ data: { userId: u.id, taskId: t.id, startedAt: new Date() } });
    expect(await commitTimer(timer, hoursAgo(1))).toBe(0.02);
  });

  it("writes an audit row", async () => {
    const u = await makeUser();
    const t = await makeTask(u.id);
    const timer = await db.taskTimer.create({ data: { userId: u.id, taskId: t.id, startedAt: hoursAgo(1) } });
    await commitTimer(timer);
    const audit = await db.timeEntryAudit.findFirstOrThrow({ where: { ownerId: u.id } });
    expect(audit).toMatchObject({ action: "timer", actorId: u.id, before: null });
  });
});

describe("reapStaleTimers", () => {
  it("stops timers with no ping for the stale window, logging up to the last ping", async () => {
    const u = await makeUser();
    const t = await makeTask(u.id);
    await db.taskTimer.create({ data: { userId: u.id, taskId: t.id, startedAt: hoursAgo(53), lastPingAt: hoursAgo(51) } });

    expect(await reapStaleTimers()).toEqual([u.id]);

    const entry = await db.timeEntry.findFirstOrThrow({ where: { userId: u.id } });
    expect(entry.hours).toBeCloseTo(2, 2);
    const audit = await db.timeEntryAudit.findFirstOrThrow({ where: { ownerId: u.id } });
    expect(audit).toMatchObject({ action: "auto_stop", actorId: null });
    expect(await db.notification.count({ where: { userId: u.id } })).toBe(1);
  });

  it("leaves timers that are still pinging alone", async () => {
    const u = await makeUser();
    const t = await makeTask(u.id);
    const justInside = new Date(Date.now() - TIMER_STALE_MS + 60_000);
    await db.taskTimer.create({ data: { userId: u.id, taskId: t.id, startedAt: hoursAgo(3), lastPingAt: justInside } });

    expect(await reapStaleTimers()).toEqual([]);
    expect(await db.taskTimer.count({ where: { userId: u.id } })).toBe(1);
  });

  it("falls back to the user's last-seen time for timers without pings", async () => {
    const gone = await makeUser({ lastSeenAt: hoursAgo(50) });
    const here = await makeUser({ lastSeenAt: new Date() });
    const t = await makeTask(gone.id);
    await db.taskTimer.create({ data: { userId: gone.id, taskId: t.id, startedAt: hoursAgo(53) } });
    await db.taskTimer.create({ data: { userId: here.id, taskId: t.id, startedAt: hoursAgo(1) } });

    expect(await reapStaleTimers()).toEqual([gone.id]);
    const entry = await db.timeEntry.findFirstOrThrow({ where: { userId: gone.id } });
    expect(entry.hours).toBeCloseTo(3, 2);
  });
});
