import { execSync } from "child_process";

/**
 * Brings the test database's tables up to date with the Prisma schema. Tests
 * create their own uniquely-named records, so the database is not wiped.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/task_manager_test";
  if (!/test/i.test(url)) {
    throw new Error(`Refusing to run tests against ${url} — TEST_DATABASE_URL must point at a database with "test" in its name.`);
  }
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });
}
