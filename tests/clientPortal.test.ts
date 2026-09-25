import { describe, expect, it } from "vitest";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { clientSecret, clientTask } from "@/lib/clientAuth";
import { makeUser } from "./helpers";

async function setup() {
  const staff = await makeUser();
  const stamp = `${Date.now()}-${Math.random()}`;
  const [mine, other] = await Promise.all([
    db.client.create({ data: { name: `Buyer A ${stamp}` } }),
    db.client.create({ data: { name: `Buyer B ${stamp}` } }),
  ]);
  const project = await db.project.create({
    data: { name: "Summer range", companyId: staff.companyId, createdById: staff.id, clientId: mine.id },
  });
  const task = (extra: object = {}) =>
    db.task.create({ data: { title: "Lab dip", createdById: staff.id, projectId: project.id, ...extra } });
  return { staff, mine, other, project, task };
}

describe("client portal access", () => {
  it("shows a client only shared, live tasks in their own projects", async () => {
    const { mine, other, task } = await setup();
    const shared = await task({ clientVisible: true });
    const internal = await task();
    const trashed = await task({ clientVisible: true, deletedAt: new Date() });

    expect((await clientTask(mine.id, shared.id))?.id).toBe(shared.id);
    expect(await clientTask(mine.id, internal.id)).toBeNull();
    expect(await clientTask(mine.id, trashed.id)).toBeNull();
    expect(await clientTask(other.id, shared.id)).toBeNull(); // another client's project
    expect(await clientTask(mine.id, Number.NaN)).toBeNull();
  });

  it("loses access when the project is unlinked or the client deleted", async () => {
    const { mine, project, task } = await setup();
    const shared = await task({ clientVisible: true });
    await db.project.update({ where: { id: project.id }, data: { clientId: null } });
    expect(await clientTask(mine.id, shared.id)).toBeNull();

    await db.project.update({ where: { id: project.id }, data: { clientId: mine.id } });
    await db.clientContact.create({ data: { clientId: mine.id, name: "Ana", email: `ana-${Date.now()}@buyer.test`, passwordHash: "x" } });
    await db.client.delete({ where: { id: mine.id } });
    expect(await db.clientContact.count({ where: { clientId: mine.id } })).toBe(0); // contacts go with it
    expect((await db.project.findUnique({ where: { id: project.id } }))?.clientId).toBeNull(); // project stays
  });

  it("signs client sessions with a key staff sessions don't accept", async () => {
    const token = await new SignJWT({ contactId: 1, kind: "client" }).setProtectedHeader({ alg: "HS256" }).sign(clientSecret());
    const staffSecret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret-do-not-use-in-production");
    await expect(jwtVerify(token, staffSecret)).rejects.toThrow();
    await expect(jwtVerify(token, clientSecret())).resolves.toBeTruthy();
  });
});
