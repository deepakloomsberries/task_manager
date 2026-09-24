import { describe, expect, it } from "vitest";
import { describeChange, snapshot } from "@/lib/timeAudit";

const base = {
  id: 1, userId: 1, date: new Date("2026-09-24"), hours: 2, taskId: 5, projectId: 7, note: "a",
};

describe("describeChange", () => {
  it("summarises edits", () => {
    const before = snapshot(base);
    const after = snapshot({ ...base, hours: 3.5, note: "b" });
    expect(describeChange(before, after)).toBe("hours 120m → 210m, note changed");
  });

  it("summarises creates and deletes", () => {
    expect(describeChange(null, snapshot(base))).toBe("120m on 2026-09-24");
    expect(describeChange(snapshot(base), null)).toBe("120m on 2026-09-24");
  });
});
