/**
 * Maps an app page to the /use guide articles that explain it, so the in-app
 * Help menu can open "how to use this page" directly. Article ids must exist in
 * app/use/content.ts (tests/guideLinks.test.ts checks this).
 */

export type GuideLink = { id: string; title: string };

type Entry = { prefix: string; main: GuideLink; related?: GuideLink[] };

// Longest prefix first — "/timesheet/team" must win over "/timesheet".
const ENTRIES: Entry[] = [
  {
    prefix: "/leave/team",
    main: { id: "approve-leave", title: "Approve leave & see who's off" },
    related: [{ id: "holidays", title: "Holidays & weekends" }],
  },
  { prefix: "/leave/holidays", main: { id: "holidays", title: "Holidays & weekends" } },
  {
    prefix: "/leave",
    main: { id: "leave", title: "Request leave" },
    related: [
      { id: "holidays", title: "Holidays & weekends" },
      { id: "calendar-sync", title: "See it all in Google Calendar" },
    ],
  },
  {
    prefix: "/timesheet/team",
    main: { id: "approve-timesheets", title: "Approve timesheets" },
    related: [{ id: "person-hours", title: "Check one person's hours" }],
  },
  {
    prefix: "/timesheet",
    main: { id: "timesheet", title: "Log time manually" },
    related: [
      { id: "timer", title: "Use the task timer" },
      { id: "submit-week", title: "Submit your week for approval" },
    ],
  },
  {
    prefix: "/tasks/",
    main: { id: "task-detail", title: "Work on a task" },
    related: [
      { id: "timer", title: "Use the task timer" },
      { id: "subtasks", title: "Subtasks, dependencies & tags" },
      { id: "comments", title: "Comment, mention and attach files" },
      { id: "review-approve", title: "Review and approve work" },
      { id: "client-share", title: "Share with a client" },
    ],
  },
  {
    prefix: "/tasks",
    main: { id: "tasks-board", title: "Tasks page: list, board and filters" },
    related: [
      { id: "create-task", title: "Create and assign a task" },
      { id: "ai-task", title: "Draft a task with AI" },
      { id: "import-tasks", title: "Import tasks from a spreadsheet" },
    ],
  },
  { prefix: "/my-tasks", main: { id: "my-tasks", title: "My Tasks" } },
  { prefix: "/recurring", main: { id: "recurring", title: "Recurring tasks tracker" } },
  {
    prefix: "/projects/",
    main: { id: "project-detail", title: "Inside a project" },
    related: [{ id: "templates", title: "Project templates" }],
  },
  {
    prefix: "/projects",
    main: { id: "projects", title: "Projects" },
    related: [{ id: "templates", title: "Project templates" }],
  },
  { prefix: "/calendar", main: { id: "calendar", title: "Calendar" } },
  { prefix: "/discussion", main: { id: "groups", title: "Group chats" } },
  { prefix: "/notifications", main: { id: "inbox", title: "Inbox (notifications)" } },
  {
    prefix: "/messages",
    main: { id: "messages", title: "Direct messages" },
    related: [
      { id: "video-calls", title: "Video calls" },
      { id: "status", title: "Set your status" },
    ],
  },
  { prefix: "/call", main: { id: "video-calls", title: "Video calls" } },
  { prefix: "/documents", main: { id: "documents", title: "Documents" } },
  { prefix: "/notes", main: { id: "notes", title: "Notes and checklists" } },
  { prefix: "/reports", main: { id: "reports", title: "Reports" } },
  {
    prefix: "/clients",
    main: { id: "clients-setup", title: "Give a client portal access" },
    related: [
      { id: "client-share", title: "Share tasks with a client" },
      { id: "client-portal", title: "What the client sees" },
    ],
  },
  { prefix: "/workload", main: { id: "workload", title: "Balance the workload" } },
  { prefix: "/templates", main: { id: "templates", title: "Project templates" } },
  {
    prefix: "/settings",
    main: { id: "profile", title: "Set your photo, language and notifications" },
    related: [
      { id: "notification-settings", title: "Choose your notifications" },
      { id: "calendar-sync", title: "Sync with Google Calendar" },
    ],
  },
  { prefix: "/users", main: { id: "users", title: "Add and manage users" } },
  { prefix: "/departments", main: { id: "departments", title: "Departments" } },
  { prefix: "/billing", main: { id: "billing", title: "Billing" } },
  { prefix: "/trash", main: { id: "recycle-bin", title: "Recycle bin" } },
  { prefix: "/people/", main: { id: "people-profile", title: "Someone's profile page" } },
  { prefix: "/search", main: { id: "search-results", title: "Full search" } },
  {
    prefix: "/dashboard",
    main: { id: "dashboard", title: "Find your way around the Dashboard" },
    related: [
      { id: "search", title: "Search everything with Ctrl/⌘ + K" },
      { id: "status", title: "Set your status" },
    ],
  },
];

const FALLBACK: Entry = ENTRIES[ENTRIES.length - 1];

/** The guide article(s) for a pathname, falling back to the dashboard guide. */
export function guideFor(pathname: string): { main: GuideLink; related: GuideLink[] } {
  const hit = ENTRIES.find((e) => (e.prefix.endsWith("/") ? pathname.startsWith(e.prefix) : pathname === e.prefix || pathname.startsWith(`${e.prefix}/`)));
  const e = hit ?? FALLBACK;
  return { main: e.main, related: e.related ?? [] };
}

/** The app page an article is about, for a "Try it in the app" link (static pages only). */
export function appPathFor(articleId: string): string | null {
  const e = ENTRIES.find((x) => x.main.id === articleId && !x.prefix.endsWith("/"));
  return e ? e.prefix : null;
}

/** Every article id referenced here (for tests). */
export function allGuideLinkIds(): string[] {
  return Array.from(new Set(ENTRIES.flatMap((e) => [e.main.id, ...(e.related ?? []).map((r) => r.id)])));
}
