import { describe, expect, it } from "vitest";
import { anchorFrom, mondayOf, stepAnchor, viewTitle, visibleDays } from "@/lib/calendarRange";

describe("calendar ranges", () => {
  it("month view covers whole Monday–Sunday weeks", () => {
    const days = visibleDays("month", "2026-09-15");
    expect(days[0]).toBe("2026-08-31");
    expect(days.at(-1)).toBe("2026-10-04");
    expect(days.length % 7).toBe(0);
  });
  it("week view is Monday to Sunday, across a month end", () => {
    expect(visibleDays("week", "2026-10-01")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(mondayOf("2026-09-28")).toBe("2026-09-28");
    expect(viewTitle("week", "2026-10-01")).toBe("28 Sep – 4 Oct 2026");
  });
  it("agenda is just the month", () => {
    const d = visibleDays("agenda", "2026-02-10");
    expect(d[0]).toBe("2026-02-01");
    expect(d.at(-1)).toBe("2026-02-28");
  });
  it("steps and anchors", () => {
    expect(stepAnchor("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(stepAnchor("week", "2026-09-30", -1)).toBe("2026-09-21");
    expect(anchorFrom({ m: "2026-03" }, "2026-09-29")).toBe("2026-03-01");
    expect(anchorFrom({ d: "2026-02-30" }, "2026-09-29")).toBe("2026-09-29");
    expect(anchorFrom({}, "2026-09-29")).toBe("2026-09-29");
  });
});
