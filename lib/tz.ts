/**
 * Per-company time zones. The team works across three offices, so "today" and
 * the greeting should follow each person's local day rather than the server's.
 * Companies are keyed by their short code; unknown codes fall back to IST.
 */
export const COMPANY_TZ: Record<string, string> = {
  IND: "Asia/Kolkata",
  UAE: "Asia/Dubai",
  KSA: "Asia/Riyadh",
};

export const DEFAULT_TZ = "Asia/Kolkata";

export const OFFICES: { code: string; label: string; tz: string }[] = [
  { code: "IND", label: "India", tz: "Asia/Kolkata" },
  { code: "UAE", label: "Dubai", tz: "Asia/Dubai" },
  { code: "KSA", label: "Riyadh", tz: "Asia/Riyadh" },
];

export function companyTimezone(company?: { code?: string | null } | null): string {
  const code = company?.code;
  return (code && COMPANY_TZ[code]) || DEFAULT_TZ;
}

/** Milliseconds a zone is ahead of UTC at the given instant (no-DST zones here). */
function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - instant.getTime();
}

/** The UTC instant corresponding to local midnight (start of today) in `tz`. */
export function zonedStartOfToday(instant: Date, tz: string): Date {
  const off = tzOffsetMs(instant, tz);
  const local = new Date(instant.getTime() + off);
  const midnightUTC = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnightUTC - off);
}

/** The local hour (0–23) in `tz` at the given instant. */
export function zonedHour(instant: Date, tz: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(instant)
  );
}

/** Formats the local date in `tz`, e.g. "Saturday, 8 August 2026". */
export function zonedDateLine(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(instant);
}
