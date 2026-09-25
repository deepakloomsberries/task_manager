import { describe, expect, it } from "vitest";
import { chosenPresence, presenceExpiry, presenceLabel, resolvePresence } from "@/lib/presence";

const NOW = new Date("2033-06-15T10:00:00+05:30").getTime();
const ago = (min: number) => new Date(NOW - min * 60000);

describe("presence", () => {
  it("is automatic: Available when looking, Away when the app is in the background, else Offline", () => {
    expect(resolvePresence({ lastSeenAt: ago(1) }, NOW).key).toBe("AVAILABLE");
    expect(resolvePresence({ lastSeenAt: ago(20), lastPingAt: ago(1) }, NOW).key).toBe("AWAY");
    expect(resolvePresence({ lastSeenAt: ago(20), lastPingAt: ago(20) }, NOW).key).toBe("OFFLINE");
    expect(resolvePresence({}, NOW).key).toBe("OFFLINE");
  });

  it("shows a picked status with its message while signed in", () => {
    const p = { lastSeenAt: ago(1), presence: "MEETING", presenceText: "Buyer call" };
    expect(resolvePresence(p, NOW)).toEqual({ key: "MEETING", message: "Buyer call" });
    expect(presenceLabel(p, NOW)).toBe("In a meeting — Buyer call");
    // Signed out: offline no matter what was picked.
    expect(resolvePresence({ ...p, lastSeenAt: ago(60) }, NOW).key).toBe("OFFLINE");
  });

  it("expires, appears offline, and shows leave", () => {
    expect(chosenPresence({ presence: "BUSY", presenceUntil: ago(1) }, NOW)).toBeNull();
    expect(resolvePresence({ lastSeenAt: ago(1), presence: "BUSY", presenceUntil: ago(1) }, NOW).key).toBe("AVAILABLE");
    expect(resolvePresence({ lastSeenAt: ago(1), presence: "OFFLINE" }, NOW).key).toBe("OFFLINE");
    expect(resolvePresence({ lastSeenAt: ago(90), onLeave: true }, NOW).key).toBe("LEAVE");
    expect(resolvePresence({ lastSeenAt: ago(1), presence: "OFFLINE", onLeave: true }, NOW).key).toBe("OFFLINE");
  });

  it("works out when a status clears", () => {
    const now = new Date(2033, 5, 15, 10, 0); // Wed 15 Jun, 10:00 local
    expect(presenceExpiry("30", now)?.getTime()).toBe(now.getTime() + 30 * 60000);
    expect(presenceExpiry("", now)).toBeNull();
    expect(presenceExpiry("junk", now)).toBeNull();
    const today = presenceExpiry("today", now)!;
    expect([today.getDate(), today.getHours(), today.getMinutes()]).toEqual([15, 23, 59]);
    const week = presenceExpiry("week", now)!;
    expect([week.getDay(), week.getDate()]).toEqual([6, 18]); // Saturday night
  });
});
