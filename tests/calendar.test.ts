import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { buildCalendar, escapeText, foldLine, googleCalendarLink, googleSubscribeLink } from "@/lib/ics";
import { feedFor } from "@/lib/calendarFeed";
import { makeTask, makeUser } from "./helpers";

describe("ics writer", () => {
  it("escapes text", () => {
    expect(escapeText("a, b; c\\d\nnext")).toBe("a\\, b\\; c\\\\d\\nnext");
  });

  it("folds long lines at 75 bytes without splitting characters", () => {
    const line = `SUMMARY:${"é".repeat(60)}`;
    const folded = foldLine(line);
    for (const part of folded.split("\r\n")) expect(Buffer.byteLength(part, "utf8")).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line);
  });

  it("writes all-day events with an exclusive end date", () => {
    const ics = buildCalendar("Test", [{ uid: "x@y", start: "2026-12-31", end: "2027-01-02", summary: "Leave", busy: true }], new Date("2026-09-25T10:00:00Z"));
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231");
    expect(ics).toContain("DTEND;VALUE=DATE:20270103");
    expect(ics).toContain("TRANSP:OPAQUE");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("builds Google Calendar links", () => {
    expect(googleCalendarLink({ title: "TM-1 · Ship it", day: "2026-10-02" })).toContain("dates=20261002%2F20261003");
    expect(googleSubscribeLink("https://task.example.com/api/calendar/abc.ics")).toBe(
      "https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2Ftask.example.com%2Fapi%2Fcalendar%2Fabc.ics"
    );
  });
});

describe("calendar feed", () => {
  it("serves a person's tasks, leave and holidays — only with their token", async () => {
    const u = await makeUser({ calendarToken: `tok_${Date.now()}_abcdefghijklmnop` });
    const t = await makeTask(u.id);
    const due = new Date();
    due.setDate(due.getDate() + 3);
    await db.task.update({ where: { id: t.id }, data: { assigneeId: u.id, dueDate: due, title: "Quarterly, report; draft" } });
    await db.leave.create({ data: { userId: u.id, startDate: new Date("2031-01-05T00:00:00Z"), endDate: new Date("2031-01-06T00:00:00Z"), status: "APPROVED", days: 2 } });
    const other = await makeUser();
    const hidden = await makeTask(other.id);
    await db.task.update({ where: { id: hidden.id }, data: { assigneeId: other.id, dueDate: due, title: "Someone else's task" } });

    const ics = await feedFor(u.calendarToken!);
    expect(ics).toContain(`TM-${t.id} · Quarterly\\, report\\; draft`);
    expect(ics).toContain("DTSTART;VALUE=DATE:20310105");
    expect(ics).not.toContain("Someone else's task");

    expect(await feedFor("not-a-real-token-at-all-000")).toBeNull();
    expect(await feedFor("../../etc")).toBeNull();
    await db.user.update({ where: { id: u.id }, data: { active: false } });
    expect(await feedFor(u.calendarToken!)).toBeNull();
  });
});
