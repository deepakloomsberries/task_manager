import { describe, expect, it } from "vitest";
import { daysLeft, dueLabel, projectHealth } from "@/lib/projectHealth";

const now = new Date("2026-09-28T10:00:00");
const d = (s: string) => new Date(`${s}T00:00:00`);
const base = { status: "ACTIVE", createdAt: d("2026-09-01"), startDate: null, dueDate: null as Date | null };

describe("project health", () => {
  it("status wins over tasks", () => {
    expect(projectHealth({ ...base, status: "COMPLETED" }, { total: 3, done: 1, overdue: 2 }, now)).toBe("DONE");
    expect(projectHealth({ ...base, status: "ON_HOLD" }, { total: 3, done: 1, overdue: 2 }, now)).toBe("PAUSED");
    expect(projectHealth({ ...base, status: "ARCHIVED" }, { total: 0, done: 0, overdue: 0 }, now)).toBe("ARCHIVED");
  });

  it("late once the deadline has passed with work left", () => {
    expect(projectHealth({ ...base, dueDate: d("2026-09-27") }, { total: 4, done: 3, overdue: 0 }, now)).toBe("LATE");
    expect(projectHealth({ ...base, dueDate: d("2026-09-27") }, { total: 4, done: 4, overdue: 0 }, now)).toBe("ON_TRACK");
  });

  it("at risk: overdue tasks, a close deadline, or behind schedule", () => {
    expect(projectHealth(base, { total: 4, done: 1, overdue: 1 }, now)).toBe("AT_RISK");
    expect(projectHealth({ ...base, dueDate: d("2026-10-02") }, { total: 10, done: 5, overdue: 0 }, now)).toBe("AT_RISK");
    // 27 of 60 days gone (45%), only 10% done
    expect(projectHealth({ ...base, dueDate: d("2026-10-31") }, { total: 10, done: 1, overdue: 0 }, now)).toBe("AT_RISK");
    expect(projectHealth({ ...base, dueDate: d("2026-10-31") }, { total: 10, done: 4, overdue: 0 }, now)).toBe("ON_TRACK");
  });

  it("no tasks yet → not started", () => {
    expect(projectHealth(base, { total: 0, done: 0, overdue: 0 }, now)).toBe("NOT_STARTED");
  });

  it("due labels count calendar days", () => {
    expect(daysLeft(d("2026-09-28"), now)).toBe(0);
    expect(dueLabel(d("2026-09-28"), now)).toBe("Due today");
    expect(dueLabel(d("2026-09-29"), now)).toBe("Due tomorrow");
    expect(dueLabel(d("2026-10-08"), now)).toBe("10 days left");
    expect(dueLabel(d("2026-09-25"), now)).toBe("3 days late");
  });
});
