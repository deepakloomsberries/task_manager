import path from "path";
import { defineConfig } from "vitest/config";

/**
 * DB tests run against a separate Postgres database (tests add and delete rows
 * in it). Point TEST_DATABASE_URL at one you don't mind being written to —
 * never the real one. Default: a local "task_manager_test" database.
 */
const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/task_manager_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/globalSetup.ts"],
    // All DB tests share one database, so run files one at a time.
    fileParallelism: false,
    env: { TZ: "Asia/Kolkata", DATABASE_URL: TEST_DB },
  },
});
