/**
 * Where a task page's "← Back" goes, and what it's called. Pages that link to
 * a task pass their own URL as `?back=…` so the person returns to the project,
 * calendar or list they came from — not always to the all-tasks list.
 */

const ALLOWED: { prefix: string; label: string }[] = [
  { prefix: "/projects/", label: "Back to project" },
  { prefix: "/projects", label: "Back to projects" },
  { prefix: "/my-tasks", label: "Back to My Tasks" },
  { prefix: "/dashboard", label: "Back to dashboard" },
  { prefix: "/calendar", label: "Back to calendar" },
  { prefix: "/recurring", label: "Back to recurring" },
  { prefix: "/people/", label: "Back to profile" },
  { prefix: "/workload", label: "Back to workload" },
  { prefix: "/reports", label: "Back to reports" },
  { prefix: "/search", label: "Back to search" },
  { prefix: "/notifications", label: "Back to inbox" },
  { prefix: "/timesheet", label: "Back to time sheet" },
  { prefix: "/leave", label: "Back to leave" },
  { prefix: "/tasks", label: "Back to tasks" },
];

/**
 * `value` if it's a same-site path to one of the pages above, else `fallback`.
 * Rejects anything that could leave the site ("//evil.com", "https://…", "\\").
 */
export function safeBack(value: unknown, fallback = "/tasks"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  const path = value.split(/[?#]/)[0];
  return ALLOWED.some((a) => {
    const base = a.prefix.replace(/\/$/, "");
    return path === base || path.startsWith(`${base}/`);
  })
    ? value
    : fallback;
}

/** "Back to project", "Back to My Tasks"… for a safeBack() result. */
export function backLabel(back: string, projectName?: string | null): string {
  const path = back.split(/[?#]/)[0];
  const hit = ALLOWED.find((a) => (a.prefix.endsWith("/") ? path.startsWith(a.prefix) : path === a.prefix || path.startsWith(`${a.prefix}/`)));
  if (hit?.prefix === "/projects/" && projectName) return `Back to "${projectName}"`;
  return hit?.label ?? "Back to tasks";
}

/** A task URL that remembers where it was opened from. */
export function taskHref(taskId: number, back: string): string {
  return `/tasks/${taskId}?back=${encodeURIComponent(back)}`;
}
