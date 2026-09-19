import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const isNewClient = !globalForPrisma.prisma;

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// SQLite's default journal mode throws SQLITE_BUSY the instant a read
// collides with a write, with no retry. That was a non-issue for a quiet
// single-writer app, but several pages now poll every few seconds each (see
// AutoRefresh) — with more than a couple of tabs open at once, that turns
// "very occasionally" into "whichever request loses the race renders
// nothing." WAL lets readers and writers proceed without blocking each
// other, and busy_timeout makes any lock that does still occur retry for a
// few seconds instead of failing immediately.
if (isNewClient) {
  // SQLite returns the new setting as a result row for these two PRAGMAs
  // (unlike a normal statement), so $queryRaw is required — $executeRaw
  // rejects any raw call that comes back with rows.
  db.$queryRawUnsafe("PRAGMA journal_mode=WAL;").catch((e) => console.error("Failed to enable WAL mode:", e));
  db.$queryRawUnsafe("PRAGMA busy_timeout=5000;").catch((e) => console.error("Failed to set busy_timeout:", e));
}
