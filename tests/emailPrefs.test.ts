import { describe, expect, it } from "vitest";
import { emailAllowed, homePageOf, inQuietHours, isMuted, mutedKinds } from "@/lib/emailPrefs";

describe("email preferences", () => {
  it("parses muted kinds, ignoring junk", () => {
    expect(mutedKinds("LEAVE, COMMENT,bogus,")).toEqual(["LEAVE", "COMMENT"]);
    expect(mutedKinds(null)).toEqual([]);
    expect(isMuted("LEAVE", "LEAVE")).toBe(true);
    expect(isMuted("LEAVE", "ASSIGN")).toBe(false);
  });

  it("needs the master switch on and the kind not muted", () => {
    expect(emailAllowed({ emailNotifications: true, emailMuted: "" }, "ASSIGN")).toBe(true);
    expect(emailAllowed({ emailNotifications: false, emailMuted: "" }, "ASSIGN")).toBe(false);
    expect(emailAllowed({ emailNotifications: true, emailMuted: "ASSIGN" }, "ASSIGN")).toBe(false);
  });

  it("quiet hours, including windows that wrap past midnight", () => {
    expect(inQuietHours(21, 8, 23)).toBe(true);
    expect(inQuietHours(21, 8, 3)).toBe(true);
    expect(inQuietHours(21, 8, 8)).toBe(false);
    expect(inQuietHours(21, 8, 12)).toBe(false);
    expect(inQuietHours(13, 14, 13)).toBe(true);
    expect(inQuietHours(null, 8, 3)).toBe(false);
    expect(inQuietHours(5, 5, 5)).toBe(false);
  });

  it("start page falls back to the dashboard", () => {
    expect(homePageOf("/projects")).toBe("/projects");
    expect(homePageOf("https://evil.example")).toBe("/dashboard");
    expect(homePageOf(null)).toBe("/dashboard");
  });
});
