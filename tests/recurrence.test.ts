import { describe, expect, it } from "vitest";
import { advanceDate, seriesKeyFor } from "@/lib/recurrence";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 10, 0);
const ymd = (x: Date) => [x.getFullYear(), x.getMonth() + 1, x.getDate()];

describe("advanceDate", () => {
  it("adds a day / week", () => {
    expect(ymd(advanceDate(d(2026, 9, 24), "DAILY"))).toEqual([2026, 9, 25]);
    expect(ymd(advanceDate(d(2026, 9, 28), "WEEKLY"))).toEqual([2026, 10, 5]);
  });

  it("crosses month and year boundaries", () => {
    expect(ymd(advanceDate(d(2026, 12, 31), "DAILY"))).toEqual([2027, 1, 1]);
    expect(ymd(advanceDate(d(2026, 12, 15), "MONTHLY"))).toEqual([2027, 1, 15]);
  });

  it("clamps monthly to the end of a shorter month", () => {
    expect(ymd(advanceDate(d(2026, 1, 31), "MONTHLY"))).toEqual([2026, 2, 28]);
    expect(ymd(advanceDate(d(2028, 1, 31), "MONTHLY"))).toEqual([2028, 2, 29]);
    expect(ymd(advanceDate(d(2026, 3, 31), "MONTHLY"))).toEqual([2026, 4, 30]);
  });

  it("keeps the time of day and doesn't mutate the input", () => {
    const src = d(2026, 5, 10);
    const out = advanceDate(src, "DAILY");
    expect(out.getHours()).toBe(10);
    expect(ymd(src)).toEqual([2026, 5, 10]);
  });

  it("returns an unchanged copy for an unknown recurrence", () => {
    const src = d(2026, 5, 10);
    expect(advanceDate(src, "NONE").getTime()).toBe(src.getTime());
  });
});

describe("seriesKeyFor", () => {
  it("is null for non-recurring tasks", () => {
    expect(seriesKeyFor({ recurrence: null, assigneeId: 1, title: "x" })).toBeNull();
  });

  it("normalises title case and whitespace", () => {
    const a = seriesKeyFor({ recurrence: "DAILY", assigneeId: 3, title: "  Daily   Report " });
    const b = seriesKeyFor({ recurrence: "DAILY", assigneeId: 3, title: "daily report" });
    expect(a).toBe(b);
    expect(a).toBe("DAILY:3:daily report");
  });

  it("separates by assignee and recurrence", () => {
    const base = { recurrence: "DAILY", assigneeId: 1, title: "x" };
    expect(seriesKeyFor(base)).not.toBe(seriesKeyFor({ ...base, assigneeId: 2 }));
    expect(seriesKeyFor(base)).not.toBe(seriesKeyFor({ ...base, recurrence: "WEEKLY" }));
    expect(seriesKeyFor({ ...base, assigneeId: null })).toBe("DAILY:0:x");
  });
});
