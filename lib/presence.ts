/**
 * Teams-style presence. People can pick a status (Busy, In a meeting, Do not
 * disturb, Away, Appear offline) with an optional message and an expiry;
 * otherwise it's worked out automatically from their heartbeats:
 * Available (looking at the app), Away (app open in the background), Offline.
 * Approved leave shows as "On leave". Safe to import in client components.
 */

export const PRESENCE_WINDOW_MS = 3 * 60 * 1000;

export type PresenceKey = "AVAILABLE" | "BUSY" | "MEETING" | "DND" | "AWAY" | "LEAVE" | "OFFLINE";

export const PRESENCE: Record<PresenceKey, { label: string; dot: string; text: string; icon: string }> = {
  AVAILABLE: { label: "Available", dot: "bg-green-500", text: "text-green-600 dark:text-green-400", icon: "✓" },
  BUSY: { label: "Busy", dot: "bg-red-500", text: "text-red-600 dark:text-red-400", icon: "" },
  MEETING: { label: "In a meeting", dot: "bg-red-500", text: "text-red-600 dark:text-red-400", icon: "📅" },
  DND: { label: "Do not disturb", dot: "bg-red-600", text: "text-red-700 dark:text-red-400", icon: "–" },
  AWAY: { label: "Away", dot: "bg-amber-400", text: "text-amber-600 dark:text-amber-400", icon: "" },
  LEAVE: { label: "On leave", dot: "bg-violet-500", text: "text-violet-600 dark:text-violet-400", icon: "🌴" },
  OFFLINE: { label: "Offline", dot: "bg-slate-300 dark:bg-slate-600", text: "text-slate-400", icon: "" },
};

/** What people can pick in the status menu ("OFFLINE" = appear offline, null = automatic). */
export const PRESENCE_CHOICES: { value: string; label: string; hint: string }[] = [
  { value: "", label: "Available", hint: "Automatic — shows when you're around" },
  { value: "BUSY", label: "Busy", hint: "Working on something, reply later" },
  { value: "MEETING", label: "In a meeting", hint: "In a meeting or call" },
  { value: "DND", label: "Do not disturb", hint: "Mutes pop-up notifications" },
  { value: "AWAY", label: "Away", hint: "Stepped out / be right back" },
  { value: "OFFLINE", label: "Appear offline", hint: "Look offline to everyone" },
];

export const PRESENCE_DURATIONS: { value: string; label: string }[] = [
  { value: "", label: "Don't clear" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
];

export const PICKABLE = ["BUSY", "MEETING", "DND", "AWAY", "OFFLINE"] as const;

export type PresenceInput = {
  lastSeenAt?: Date | string | null;
  lastPingAt?: Date | string | null;
  presence?: string | null;
  presenceText?: string | null;
  presenceUntil?: Date | string | null;
  /** On approved leave today (the caller looks this up). */
  onLeave?: boolean;
};

const recent = (d: Date | string | null | undefined, now: number) => !!d && now - new Date(d).getTime() < PRESENCE_WINDOW_MS;

/** The status someone picked, if it hasn't expired. */
export function chosenPresence(p: PresenceInput, now: number = Date.now()): string | null {
  if (!p.presence) return null;
  if (p.presenceUntil && new Date(p.presenceUntil).getTime() <= now) return null;
  return p.presence;
}

export function resolvePresence(p: PresenceInput, now: number = Date.now()): { key: PresenceKey; message: string | null } {
  const chosen = chosenPresence(p, now);
  const message = chosen && p.presenceText ? p.presenceText : null;
  if (chosen === "OFFLINE") return { key: "OFFLINE", message: null };
  if (p.onLeave) return { key: "LEAVE", message };
  const seen = recent(p.lastSeenAt, now);
  const open = seen || recent(p.lastPingAt, now);
  if (!open) return { key: "OFFLINE", message: null };
  if (chosen && chosen in PRESENCE) return { key: chosen as PresenceKey, message };
  return { key: seen ? "AVAILABLE" : "AWAY", message };
}

/** "Busy — Back at 3pm" style label. */
export function presenceLabel(p: PresenceInput, now: number = Date.now()): string {
  const r = resolvePresence(p, now);
  return r.message ? `${PRESENCE[r.key].label} — ${r.message}` : PRESENCE[r.key].label;
}

/** When a picked status should expire, from a PRESENCE_DURATIONS value. */
export function presenceExpiry(duration: string, now: Date = new Date()): Date | null {
  if (/^\d+$/.test(duration)) {
    const mins = Math.min(Number(duration), 7 * 24 * 60);
    return mins > 0 ? new Date(now.getTime() + mins * 60000) : null;
  }
  if (duration === "today" || duration === "week") {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    if (duration === "week") end.setDate(end.getDate() + ((6 - end.getDay() + 7) % 7));
    return end;
  }
  return null;
}

/** Fields to select on a user for presence. */
export const PRESENCE_SELECT = {
  lastSeenAt: true,
  lastPingAt: true,
  presence: true,
  presenceText: true,
  presenceUntil: true,
} as const;
