export const TASK_STATUSES = [
  { value: "TODO", label: "To Do", badge: "bg-slate-100 text-slate-700" },
  { value: "IN_PROGRESS", label: "In Progress", badge: "bg-blue-100 text-blue-700" },
  { value: "REVIEW", label: "In Review", badge: "bg-amber-100 text-amber-700" },
  { value: "DONE", label: "Done", badge: "bg-green-100 text-green-700" },
];

export const TASK_PRIORITIES = [
  { value: "LOW", label: "Low", badge: "bg-slate-100 text-slate-600" },
  { value: "MEDIUM", label: "Medium", badge: "bg-sky-100 text-sky-700" },
  { value: "HIGH", label: "High", badge: "bg-orange-100 text-orange-700" },
  { value: "URGENT", label: "Urgent", badge: "bg-red-100 text-red-700" },
];

export const PROJECT_STATUSES = [
  { value: "ACTIVE", label: "Active", badge: "bg-green-100 text-green-700" },
  { value: "ON_HOLD", label: "On Hold", badge: "bg-amber-100 text-amber-700" },
  { value: "COMPLETED", label: "Completed", badge: "bg-blue-100 text-blue-700" },
  { value: "ARCHIVED", label: "Archived", badge: "bg-slate-100 text-slate-500" },
];

export const ROLES = [
  { value: "ADMIN", label: "Admin", badge: "bg-purple-100 text-purple-700" },
  { value: "MANAGER", label: "Manager", badge: "bg-blue-100 text-blue-700" },
  { value: "EMPLOYEE", label: "Employee", badge: "bg-slate-100 text-slate-600" },
];

export const TAG_COLORS = ["slate", "red", "orange", "amber", "green", "sky", "blue", "purple", "pink"];

// Literal class names so Tailwind's build keeps them.
export const TAG_BADGES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700",
  red: "bg-red-100 text-red-700",
  orange: "bg-orange-100 text-orange-700",
  amber: "bg-amber-100 text-amber-700",
  green: "bg-green-100 text-green-700",
  sky: "bg-sky-100 text-sky-700",
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
  pink: "bg-pink-100 text-pink-700",
};

export function tagBadge(color: string) {
  return TAG_BADGES[color] ?? TAG_BADGES.slate;
}

// Keep-style note card colors: card background + swatch preview.
export const NOTE_COLORS: { value: string; card: string; swatch: string }[] = [
  { value: "default", card: "bg-white border-slate-200", swatch: "bg-white border-slate-300" },
  { value: "red", card: "bg-red-50 border-red-200", swatch: "bg-red-200 border-red-300" },
  { value: "orange", card: "bg-orange-50 border-orange-200", swatch: "bg-orange-200 border-orange-300" },
  { value: "yellow", card: "bg-amber-50 border-amber-200", swatch: "bg-amber-200 border-amber-300" },
  { value: "green", card: "bg-green-50 border-green-200", swatch: "bg-green-200 border-green-300" },
  { value: "teal", card: "bg-teal-50 border-teal-200", swatch: "bg-teal-200 border-teal-300" },
  { value: "blue", card: "bg-sky-50 border-sky-200", swatch: "bg-sky-200 border-sky-300" },
  { value: "purple", card: "bg-purple-50 border-purple-200", swatch: "bg-purple-200 border-purple-300" },
  { value: "pink", card: "bg-pink-50 border-pink-200", swatch: "bg-pink-200 border-pink-300" },
];

export function noteCard(color: string) {
  return (NOTE_COLORS.find((c) => c.value === color) ?? NOTE_COLORS[0]).card;
}

const AVATAR_COLORS = [
  "bg-sky-600",
  "bg-emerald-600",
  "bg-violet-600",
  "bg-rose-600",
  "bg-amber-600",
  "bg-teal-600",
  "bg-indigo-600",
  "bg-orange-600",
  "bg-cyan-700",
  "bg-fuchsia-600",
];

/** Deterministic avatar color per person, so each user looks the same everywhere. */
export function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function lookup(list: { value: string; label: string; badge: string }[], value: string) {
  return list.find((x) => x.value === value) ?? { value, label: value, badge: "bg-slate-100 text-slate-600" };
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Whole-currency-unit amount with grouping, e.g. fmtMoney(5000, "INR") → "₹5,000". */
export function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Unknown/invalid currency code — fall back to a plain labeled number.
    return `${amount.toLocaleString("en-IN")} ${currency}`;
  }
}

/**
 * Chat-list-style timestamp: just the clock time for something from today
 * ("14:32"), "Yesterday" for the day before, or a short date further back —
 * the WhatsApp convention, instead of always spelling out the full date.
 */
export function fmtChatListTime(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString("en-GB", { weekday: "short" });
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function toInputDate(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

/** "09:05" — clock time for display. */
export function fmtClock(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** "09:05" — value for an <input type="time"> from a Date. */
export function toInputTime(d: Date | string | null | undefined) {
  if (!d) return "";
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(x.getHours())}:${p(x.getMinutes())}`;
}

/** "09:05 – 10:30" when both ends exist, else "". */
export function fmtTimeRange(start: Date | string | null | undefined, end: Date | string | null | undefined) {
  if (!start || !end) return "";
  return `${fmtClock(start)} – ${fmtClock(end)}`;
}

export function isOverdue(task: { dueDate: Date | null; status: string }) {
  return !!task.dueDate && task.status !== "DONE" && new Date(task.dueDate) < new Date();
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** How recently a heartbeat must have arrived for someone to count as online. */
export const ONLINE_WINDOW_MS = 3 * 60 * 1000;

export function isOnline(lastSeenAt: Date | string | null | undefined) {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

/** Human "last seen" label, e.g. "Active now", "Active 5m ago", "Last seen 12 Aug". */
export function lastSeenLabel(lastSeenAt: Date | string | null | undefined) {
  if (!lastSeenAt) return "Offline";
  const d = new Date(lastSeenAt);
  const diff = Date.now() - d.getTime();
  if (diff < ONLINE_WINDOW_MS) return "Active now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Active ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Active yesterday";
  if (days < 7) return `Active ${days}d ago`;
  return `Last seen ${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;
}

/** Short relative time, e.g. "just now", "5m ago", "3h ago", "2d ago", or a date. */
export function fmtRelative(d: Date | string | null | undefined) {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

/**
 * Formats a decimal hours value as human "Xh Ym" (e.g. 0.766… → "46m",
 * 2.5 → "2h 30m"). Used for logged time so we never surface raw floats.
 */
export function fmtHours(hours: number | null | undefined) {
  const totalMinutes = Math.round((hours ?? 0) * 60);
  if (totalMinutes <= 0) return "0m";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Parses a flexible time-of-work string into decimal hours, so people can log
 * time the way they think about it. Accepts:
 *   "2.5" / "2"        → 2.5 / 2 hours
 *   "0:45" / "2:30"    → H:MM
 *   "45m" / "90 min"   → minutes
 *   "1h" / "1h30m"     → hours (+ optional minutes)
 *   "1h 30m"           → hours + minutes
 * Returns null when the input can't be understood.
 */
export function parseHours(raw: string | null | undefined): number | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;

  // H:MM clock format, e.g. 0:45, 2:30
  const clock = s.match(/^(\d+):([0-5]?\d)$/);
  if (clock) return Number(clock[1]) + Number(clock[2]) / 60;

  // "1h", "1h30m", "1h 30m", "45m", "30 min", "1.5h"
  const hm = s.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?$/);
  if (hm && (hm[1] || hm[2])) {
    const h = hm[1] ? Number(hm[1]) : 0;
    const m = hm[2] ? Number(hm[2]) : 0;
    return h + m / 60;
  }

  // Plain decimal hours, e.g. 2.5
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);

  return null;
}

/** Formats a number of seconds as H:MM:SS (or M:SS under an hour) for timers. */
export function fmtDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
