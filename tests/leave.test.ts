import { describe, expect, it } from "vitest";
import {
  countLeaveDays, covers, eachDay, fmtDays, fmtRange, isWorkingDay, parseYmd, rangesOverlap, todayIn, weekendSet, ymd,
} from "@/lib/leave";

const none = new Set<string>();

describe("dates", () => {
  it("parses and prints calendar days without time-zone drift", () => {
    expect(ymd(parseYmd("2026-10-02")!)).toBe("2026-10-02");
    expect(parseYmd("2026-02-30")).toBeNull();
    expect(parseYmd("02/10/2026")).toBeNull();
    expect(parseYmd(undefined)).toBeNull();
  });

  it("lists every day in a range, across months", () => {
    expect(eachDay("2026-09-29", "2026-10-02")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(eachDay("2026-10-02", "2026-10-01")).toEqual([]);
  });

  it("gives today's date in each office's time zone", () => {
    const lateUtc = new Date("2026-09-24T20:00:00Z"); // 01:30 on the 25th in India, 00:00 in Dubai, 23:00 on the 24th in Riyadh
    expect(todayIn("Asia/Kolkata", lateUtc)).toBe("2026-09-25");
    expect(todayIn("Asia/Riyadh", lateUtc)).toBe("2026-09-24");
  });
});

describe("working days", () => {
  it("reads an office's weekend setting", () => {
    expect(Array.from(weekendSet("5,6"))).toEqual([5, 6]);
    expect(Array.from(weekendSet("0, 9, x"))).toEqual([0]);
    expect(weekendSet(null).size).toBe(0);
  });

  it("skips weekends and holidays", () => {
    const sun = weekendSet("0");
    expect(isWorkingDay("2026-10-04", sun, none)).toBe(false); // Sunday
    expect(isWorkingDay("2026-10-02", sun, new Set(["2026-10-02"]))).toBe(false); // holiday
    expect(isWorkingDay("2026-10-03", sun, none)).toBe(true); // Saturday, 6-day week
  });

  it("counts leave in working days", () => {
    // Thu 1 Oct → Tue 6 Oct 2026, Sunday off, Fri 2 Oct a holiday → Thu, Sat, Mon, Tue.
    expect(countLeaveDays({ start: "2026-10-01", end: "2026-10-06" }, weekendSet("0"), new Set(["2026-10-02"]))).toBe(4);
    // Same range, Fri–Sat weekend (KSA): Thu, Sun, Mon, Tue.
    expect(countLeaveDays({ start: "2026-10-01", end: "2026-10-06" }, weekendSet("5,6"), none)).toBe(4);
  });

  it("counts a half day as 0.5, and nothing on a day off", () => {
    expect(countLeaveDays({ start: "2026-10-05", end: "2026-10-05", halfDay: true }, weekendSet("0"), none)).toBe(0.5);
    expect(countLeaveDays({ start: "2026-10-04", end: "2026-10-04", halfDay: true }, weekendSet("0"), none)).toBe(0);
  });
});

describe("coverage", () => {
  const leave = { userId: 1, startDate: new Date("2026-10-01T00:00:00Z"), endDate: new Date("2026-10-03T00:00:00Z"), status: "APPROVED" };

  it("only approved leave counts, end date inclusive", () => {
    expect(covers(leave, "2026-10-03")).toBe(true);
    expect(covers(leave, "2026-10-04")).toBe(false);
    expect(covers({ ...leave, status: "PENDING" }, "2026-10-02")).toBe(false);
  });

  it("detects overlapping ranges", () => {
    expect(rangesOverlap("2026-10-01", "2026-10-03", "2026-10-03", "2026-10-05")).toBe(true);
    expect(rangesOverlap("2026-10-01", "2026-10-03", "2026-10-04", "2026-10-05")).toBe(false);
  });

  it("formats ranges and day counts", () => {
    expect(fmtRange("2026-10-02", "2026-10-02")).toBe("2 Oct");
    expect(fmtRange("2026-10-02", "2026-10-04")).toBe("2–4 Oct");
    expect(fmtRange("2026-09-30", "2026-10-02")).toBe("30 Sept – 2 Oct");
    expect(fmtDays(1)).toBe("1 day");
    expect(fmtDays(0.5)).toBe("0.5 day");
    expect(fmtDays(3)).toBe("3 days");
  });
});
