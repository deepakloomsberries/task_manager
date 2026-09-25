/**
 * One-off: copy everything from the old SQLite database (prisma/dev.db) into
 * the new, empty Postgres database — same ids, same data.
 *
 *   npm run db:migrate-from-sqlite
 *
 * which runs, with .env's DATABASE_URL pointing at Postgres:
 *   npx prisma generate --schema prisma/legacy-sqlite/schema.prisma
 *   SQLITE_URL=file:/home/kapil/task_manager/prisma/dev.db npx tsx scripts/migrate-sqlite-to-postgres.ts
 *
 * Safe by design:
 * - reads SQLite only, never writes to it (keep it as your fallback);
 * - refuses to run unless the Postgres tables are empty (run `npx prisma db
 *   push` first to create them);
 * - copies tables parents-first, handles self-references (subtasks, replies)
 *   in a second pass, resets id sequences, then compares row counts table by
 *   table and exits non-zero on any mismatch.
 */
import fs from "fs";
import path from "path";

// Minimal .env loader so the script works standalone.
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const BATCH = 500;

type Field = {
  name: string;
  kind: string;
  type: string;
  isId?: boolean;
  isUpdatedAt?: boolean;
  relationFromFields?: readonly string[];
  default?: unknown;
};
type Model = { name: string; fields: readonly Field[]; primaryKey: { fields: readonly string[] } | null };

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Parents before children, ignoring self-references (handled separately). */
export function loadOrder(models: readonly Model[]): string[] {
  const deps = new Map<string, Set<string>>();
  for (const m of models) {
    const d = new Set<string>();
    for (const f of m.fields) {
      if (f.relationFromFields?.length && f.type !== m.name) d.add(f.type);
    }
    deps.set(m.name, d);
  }
  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < models.length) {
    const ready = models.filter((m) => !done.has(m.name) && Array.from(deps.get(m.name)!).every((d) => done.has(d)));
    if (!ready.length) throw new Error(`Circular foreign keys between: ${models.filter((m) => !done.has(m.name)).map((m) => m.name).join(", ")}`);
    for (const m of ready) {
      order.push(m.name);
      done.add(m.name);
    }
  }
  return order;
}

async function main() {
  const target = process.env.DATABASE_URL ?? "";
  if (!/^postgres(ql)?:\/\//.test(target)) throw new Error("DATABASE_URL must be the new postgresql:// database.");
  const sqliteUrl = process.env.SQLITE_URL ?? `file:${path.join(process.cwd(), "prisma", "dev.db")}`;
  const sqliteFile = sqliteUrl.replace(/^file:/, "");
  if (!fs.existsSync(sqliteFile)) throw new Error(`SQLite database not found at ${sqliteFile} (set SQLITE_URL=file:/path/to/dev.db).`);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const legacy = require("../node_modules/.prisma/legacy-sqlite") as {
    PrismaClient: new (o: object) => Record<string, unknown> & { $disconnect(): Promise<void> };
    Prisma: { dmmf: { datamodel: { models: readonly Model[] } } };
  };
  const { PrismaClient } = await import("@prisma/client");

  const from = new legacy.PrismaClient({ datasources: { db: { url: sqliteUrl } } });
  const to = new PrismaClient();
  type Delegate = {
    count(): Promise<number>;
    findMany(a: object): Promise<Record<string, unknown>[]>;
    createMany(a: object): Promise<{ count: number }>;
    update(a: object): Promise<unknown>;
  };
  const src = (m: string) => from[lower(m)] as Delegate;
  const dst = (m: string) => (to as unknown as Record<string, Delegate>)[lower(m)];

  const models = legacy.Prisma.dmmf.datamodel.models;
  const order = loadOrder(models);

  // Refuse to touch a database that already has data.
  for (const m of order) {
    if (!dst(m)) throw new Error(`Postgres schema has no ${m} table — run "npx prisma db push" first.`);
    const n = await dst(m).count();
    if (n > 0) throw new Error(`Postgres table ${m} already has ${n} rows. This script only fills an empty database.`);
  }

  console.log(`Copying ${order.length} tables from ${sqliteFile} → Postgres\n`);
  const report: { model: string; source: number; copied: number }[] = [];

  for (const name of order) {
    const model = models.find((m) => m.name === name)!;
    const scalars = model.fields.filter((f) => f.kind === "scalar" || f.kind === "enum").map((f) => f.name);
    const pk = model.primaryKey?.fields ?? model.fields.filter((f) => f.isId).map((f) => f.name);
    // @updatedAt columns would be bumped by the second-pass update — keep the originals.
    const updatedAtFields = model.fields.filter((f) => f.isUpdatedAt).map((f) => f.name);
    const selfFks = model.fields.filter((f) => f.relationFromFields?.length && f.type === name).flatMap((f) => [...f.relationFromFields!]);
    const orderBy = pk.map((k) => ({ [k]: "asc" }));

    const total = await src(name).count();
    let copied = 0;
    const deferred: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];

    for (let skip = 0; skip < total; skip += BATCH) {
      const rows = await src(name).findMany({ orderBy, skip, take: BATCH });
      const data = rows.map((r) => {
        const row: Record<string, unknown> = {};
        for (const k of scalars) row[k] = r[k];
        // Self-references (a subtask's parent, a reply's original) may point at
        // a row that isn't copied yet — link them up in a second pass.
        const later: Record<string, unknown> = {};
        for (const k of selfFks) {
          if (row[k] != null) later[k] = row[k];
          row[k] = null;
        }
        for (const k of updatedAtFields) if (Object.keys(later).length) later[k] = r[k];
        if (Object.keys(later).length) deferred.push({ where: Object.fromEntries(pk.map((k) => [k, r[k]])), data: later });
        return row;
      });
      const res = await dst(name).createMany({ data });
      copied += res.count;
    }
    for (const d of deferred) await dst(name).update(d);

    // Continue ids after the highest copied one, so new rows don't collide.
    const auto = model.fields.find((f) => f.isId && (f.default as { name?: string } | undefined)?.name === "autoincrement");
    if (auto) {
      await to.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"${name}"', '${auto.name}'), COALESCE(MAX("${auto.name}"), 1), MAX("${auto.name}") IS NOT NULL) FROM "${name}"`
      );
    }
    report.push({ model: name, source: total, copied });
    console.log(`  ${name.padEnd(22)} ${String(copied).padStart(7)} rows${deferred.length ? ` (+${deferred.length} links)` : ""}`);
  }

  // Verify: same row counts, then every row compared field by field.
  console.log("\nVerifying every row…");
  let bad = 0;
  for (const r of report) {
    const now = await dst(r.model).count();
    if (now !== r.source) {
      bad++;
      console.error(`  ✗ ${r.model}: SQLite has ${r.source}, Postgres has ${now}`);
      continue;
    }
    const model = models.find((m) => m.name === r.model)!;
    const pk = model.primaryKey?.fields ?? model.fields.filter((f) => f.isId).map((f) => f.name);
    const orderBy = pk.map((k) => ({ [k]: "asc" }));
    for (let skip = 0; skip < r.source; skip += BATCH) {
      const [a, b] = await Promise.all([
        src(r.model).findMany({ orderBy, skip, take: BATCH }),
        dst(r.model).findMany({ orderBy, skip, take: BATCH }),
      ]);
      // Compare the columns the old database has; new columns (added since)
      // just hold their defaults in Postgres.
      const cols = model.fields.filter((f) => f.kind === "scalar" || f.kind === "enum").map((f) => f.name);
      const pick = (row: Record<string, unknown> | undefined) => JSON.stringify(cols.map((c) => row?.[c]));
      const diff = a.findIndex((row, i) => pick(row) !== pick(b[i]));
      if (diff >= 0) {
        bad++;
        console.error(`  ✗ ${r.model}: row ${skip + diff + 1} differs`);
        break;
      }
    }
  }
  await from.$disconnect();
  await to.$disconnect();
  if (bad) throw new Error(`${bad} table(s) don't match — see above. Postgres was NOT switched on; fix and retry on an empty database.`);
  console.log(`\n✓ All ${report.length} tables copied and verified (${report.reduce((s, r) => s + r.copied, 0)} rows).`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\nMigration FAILED: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
