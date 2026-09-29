/** Kinds of email a person can switch off one by one in Settings. */
export const EMAIL_KINDS = [
  { key: "ASSIGN", label: "Assigned to me", hint: "A task is assigned to you or you're added as a collaborator." },
  { key: "REVIEW", label: "Reviews & approvals", hint: "Work sent for your review, completed, approved or sent back." },
  { key: "COMMENT", label: "Comments & mentions", hint: "Someone comments on a task you're part of or @mentions you." },
  { key: "REMINDER", label: "Reminders", hint: "Task reminders and the weekly timesheet nudge." },
  { key: "LEAVE", label: "Team leave", hint: "When a colleague books or cancels leave." },
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number]["key"];

export function mutedKinds(raw: string | null | undefined): EmailKind[] {
  const valid = new Set<string>(EMAIL_KINDS.map((k) => k.key));
  return (raw ?? "").split(",").map((s) => s.trim()).filter((s): s is EmailKind => valid.has(s));
}

export function isMuted(raw: string | null | undefined, kind: EmailKind) {
  return mutedKinds(raw).includes(kind);
}

/** Whether a person gets a given email: master switch on and that kind not muted. */
export function emailAllowed(u: { emailNotifications: boolean; emailMuted?: string | null }, kind: EmailKind) {
  return u.emailNotifications && !isMuted(u.emailMuted, kind);
}

/** Where someone can choose to land after signing in. */
export const HOME_PAGES = [
  { value: "/dashboard", label: "Dashboard" },
  { value: "/my-tasks", label: "My Tasks" },
  { value: "/tasks", label: "Tasks" },
  { value: "/projects", label: "Projects" },
  { value: "/calendar", label: "Calendar" },
  { value: "/messages", label: "Messages" },
  { value: "/notifications", label: "Inbox" },
  { value: "/documents", label: "Documents" },
  { value: "/timesheet", label: "Time sheet" },
] as const;

export function homePageOf(raw: string | null | undefined) {
  return HOME_PAGES.some((p) => p.value === raw) ? (raw as string) : "/dashboard";
}

/**
 * Whether `hour` (0–23, local) falls in quiet hours. The window can wrap past
 * midnight (e.g. 21 → 8). Same start and end, or either unset, means off.
 */
export function inQuietHours(start: number | null | undefined, end: number | null | undefined, hour: number) {
  if (start == null || end == null || start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function hourLabel(h: number) {
  const ampm = h < 12 ? "am" : "pm";
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n}${ampm}`;
}
