import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { revokeSessions } from "@/lib/auth";
import { changeStamp } from "@/lib/changeStamp";
import { makeUser, makeTask } from "./helpers";

describe("sessions", () => {
  it("revoking moves the version on, so older cookies stop matching", async () => {
    const u = await makeUser();
    expect(u.sessionVersion).toBe(0);
    expect(await revokeSessions(u.id)).toBe(1);
    expect(await revokeSessions(u.id)).toBe(2);
    expect((await db.user.findUnique({ where: { id: u.id } }))!.sessionVersion).toBe(2);
  });
});

describe("change stamp", () => {
  it("changes when a task changes or a notification arrives, and not otherwise", async () => {
    const u = await makeUser();
    const t = await makeTask(u.id);
    const wait = () => new Promise((r) => setTimeout(r, 4100)); // shared part is cached ~4s
    const a = await changeStamp(u.id);
    expect(await changeStamp(u.id)).toBe(a);
    await db.notification.create({ data: { userId: u.id, message: "hi" } });
    const b = await changeStamp(u.id);
    expect(b).not.toBe(a); // per-person part is never cached
    await db.task.update({ where: { id: t.id }, data: { title: "renamed" } });
    await wait();
    expect(await changeStamp(u.id)).not.toBe(b);
  }, 15_000);
});
