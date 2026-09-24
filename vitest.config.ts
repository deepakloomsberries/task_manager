import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/globalSetup.ts"],
    // All DB tests share one throwaway SQLite file, so run files one at a time.
    fileParallelism: false,
    env: {
      TZ: "Asia/Kolkata",
      DATABASE_URL: `file:${path.resolve(__dirname, "tests/.tmp/test.db")}`,
    },
  },
});
