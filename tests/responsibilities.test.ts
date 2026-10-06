import { describe, expect, it } from "vitest";
import { MAX_RESPONSIBILITIES, normalizeResponsibilities, parseResponsibilities } from "@/lib/responsibilities";

describe("responsibilities", () => {
  it("parses one per line, stripping bullets and numbering", () => {
    expect(parseResponsibilities("- Amazon listings\n\n• Daily stock sync\n2) Weekly report\n  * Returns  ")).toEqual([
      "Amazon listings",
      "Daily stock sync",
      "Weekly report",
      "Returns",
    ]);
    expect(parseResponsibilities(null)).toEqual([]);
  });

  it("normalizes: dedupes case-insensitively, caps count, null when empty", () => {
    expect(normalizeResponsibilities("Reports\nreports\r\nFZC")).toBe("Reports\nFZC");
    expect(normalizeResponsibilities("  \n - \n")).toBeNull();
    const many = Array.from({ length: 30 }, (_, i) => `Item ${i}`).join("\n");
    expect(normalizeResponsibilities(many)!.split("\n")).toHaveLength(MAX_RESPONSIBILITIES);
  });
});
