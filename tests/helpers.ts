import { db } from "@/lib/db";

let n = 0;

/** Minimal user (+ its company) for DB-backed tests. */
export async function makeUser(extra: Record<string, unknown> = {}) {
  n++;
  const company = await db.company.create({ data: { name: `Co ${n} ${Date.now()}`, code: `C${n}${Date.now()}` } });
  return db.user.create({
    data: { name: `User ${n}`, email: `user${n}-${Date.now()}@test.local`, passwordHash: "x", companyId: company.id, ...extra },
  });
}

export async function makeTask(createdById: number) {
  return db.task.create({ data: { title: `Task ${++n}`, createdById } });
}

export const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
