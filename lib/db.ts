import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// One client (and connection pool) per process — Next's dev hot reload would
// otherwise open a new pool on every edit. Postgres handles concurrent reads
// and writes itself, so none of the old SQLite WAL / busy_timeout tuning is
// needed. Pool size can be tuned with ?connection_limit=N on DATABASE_URL.
export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
