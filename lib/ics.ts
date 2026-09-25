/**
 * Minimal iCalendar (RFC 5545) writer for the personal calendar feed that
 * Google Calendar, Outlook and Apple Calendar subscribe to. All events here
 * are all-day, which is how due dates, leave and holidays read best.
 */

export type IcsEvent = {
  uid: string;
  /** First day, "YYYY-MM-DD". */
  start: string;
  /** Last day, inclusive, "YYYY-MM-DD" (defaults to start). */
  end?: string;
  summary: string;
  description?: string;
  url?: string;
  /** TRANSPARENT events don't block time (tasks); OPAQUE ones do (leave). */
  busy?: boolean;
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  updated?: Date;
};

/** Escapes text values: backslash, semicolon, comma and newlines. */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line to at most 75 octets per line (UTF-8 safe). */
export function foldLine(line: string): string {
  const bytes = (s: string) => Buffer.byteLength(s, "utf8");
  if (bytes(line) <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of Array.from(line)) {
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes(cur + ch) > limit) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p, i) => (i === 0 ? p : ` ${p}`)).join("\r\n");
}

const compact = (ymd: string) => ymd.replace(/-/g, "");

function nextDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildCalendar(name: string, events: IcsEvent[], now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Looms & Berries//Tasks//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-PUBLISHED-TTL:PT1H",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp(now)}`,
      ...(e.updated ? [`LAST-MODIFIED:${stamp(e.updated)}`] : []),
      `DTSTART;VALUE=DATE:${compact(e.start)}`,
      // DTEND is exclusive for all-day events.
      `DTEND;VALUE=DATE:${compact(nextDay(e.end ?? e.start))}`,
      `SUMMARY:${escapeText(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      `TRANSP:${e.busy ? "OPAQUE" : "TRANSPARENT"}`,
      `STATUS:${e.status ?? "CONFIRMED"}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** A "create event" link that opens Google Calendar pre-filled (all-day). */
export function googleCalendarLink(e: { title: string; day: string; details?: string }): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${compact(e.day)}/${compact(nextDay(e.day))}`,
    ...(e.details ? { details: e.details } : {}),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Google Calendar's "subscribe to this calendar" link for a feed URL. */
export function googleSubscribeLink(feedUrl: string): string {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feedUrl.replace(/^https?:/, "webcal:"))}`;
}
