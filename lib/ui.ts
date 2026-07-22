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

export function toInputDate(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
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
