import fs from "fs";
import path from "path";
import { execSync } from "child_process";

/** Creates a fresh throwaway SQLite database from the Prisma schema. */
export default function setup() {
  const dir = path.resolve(__dirname, ".tmp");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: `file:${path.join(dir, "test.db")}` },
    stdio: "ignore",
  });
  return () => fs.rmSync(dir, { recursive: true, force: true });
}
