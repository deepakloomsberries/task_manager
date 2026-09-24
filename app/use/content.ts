/**
 * Content for the public /use knowledge base. Each article pairs a screenshot
 * (public/guide/<shot>.jpg, captured by scripts/guide/capture.cjs from a demo
 * database with fictional data) with numbered callouts. A callout's `spot` is
 * the key of an element box recorded in shots.json — the guide draws a
 * numbered badge and an arrow onto that element.
 */

export type Audience = "Everyone" | "Managers" | "Admins";

export type Callout = {
  spot: string;
  title: string;
  body: string;
  /** Where the badge sits relative to the element. Defaults to the roomiest side. */
  side?: "left" | "right" | "top" | "bottom" | "inside";
};

export type Article = {
  id: string;
  title: string;
  audience: Audience;
  summary: string;
  shot?: string;
  callouts?: Callout[];
  /** Extra un-numbered tips shown under the callouts. */
  tips?: string[];
};

export type Category = {
  id: string;
  title: string;
  icon: string;
  blurb: string;
  articles: Article[];
};

export const CATEGORIES: Category[] = [
  {
    id: "getting-started",
    title: "Getting started",
    icon: "🚀",
    blurb: "Sign in, find your way around and set up your profile.",
    articles: [
      {
        id: "sign-in",
        title: "Sign in for the first time",
        audience: "Everyone",
        summary:
          "Your admin creates your account and sends you a temporary password. The first time you sign in you'll be asked to choose your own.",
        shot: "login",
        callouts: [
          { spot: "email", title: "Your work email", body: "Use the company email your admin registered — not a personal address.", side: "left" },
          { spot: "password", title: "Password", body: "Type the temporary password, then pick a strong new one on the next screen.", side: "left" },
          { spot: "signin", title: "Sign in", body: "You'll land on your Dashboard. Sessions stay signed in on that browser.", side: "left" },
          { spot: "forgot", title: "Forgot your password?", body: "We email you a 6-digit code — enter it with a new password. Codes expire after 15 minutes.", side: "right" },
        ],
        tips: [
          "After 5 wrong passwords in a row the account is paused for 15 minutes — just wait and try again, or use “Forgot password”.",
        ],
      },
      {
        id: "dashboard",
        title: "Find your way around the Dashboard",
        audience: "Everyone",
        summary:
          "The Dashboard answers “what needs me today?”. Everything else is one click away in the left sidebar.",
        shot: "dashboard",
        callouts: [
          { spot: "sidebar", title: "Sidebar", body: "Every module lives here. Badges show unread messages, inbox items and tasks due today.", side: "inside" },
          { spot: "search", title: "Search (Ctrl/⌘ + K)", body: "Jump to any task, project, page or person — or create a task by typing its title.", side: "bottom" },
          { spot: "bell", title: "Notifications", body: "Assignments, comments, mentions and approvals. The red number is what you haven't read yet.", side: "bottom" },
          { spot: "newtask", title: "New task", body: "Quickest way to add a task from anywhere on the Dashboard.", side: "bottom" },
          { spot: "stats", title: "Today at a glance", body: "Open, overdue and in-review counts. Managers also see timesheets waiting for approval.", side: "bottom" },
          { spot: "attention", title: "Needs your attention", body: "Click any row to open exactly the filtered list behind it.", side: "left" },
          { spot: "working", title: "Working right now", body: "Who has a timer running, on which task, and for how long.", side: "left" },
        ],
      },
      {
        id: "profile",
        title: "Set your photo, language and notifications",
        audience: "Everyone",
        summary: "Open Settings from the bottom of the sidebar to personalise your account.",
        shot: "settings",
        callouts: [
          { spot: "avatar", title: "Profile picture", body: "Upload a JPG/PNG — it's auto-cropped to a square and shown next to your name everywhere.", side: "right" },
          { spot: "language", title: "Preferred chat language", body: "Messages people send you are translated into this language automatically. “Show original” is always one tap away.", side: "right" },
        ],
        tips: [
          "Further down Settings you can turn email notifications on or off and change your password.",
          "Allow browser notifications when asked — you'll get a pop-up for new assignments and messages even when the tab is in the background.",
        ],
      },
      {
        id: "search",
        title: "Search everything with Ctrl/⌘ + K",
        audience: "Everyone",
        summary: "Press Ctrl + K (⌘ + K on Mac) on any page, or click the Search box in the top bar.",
        shot: "palette",
        callouts: [
          { spot: "results", title: "Type anything", body: "Task titles, a task code like TM-42, project names, people or page names. Use ↑ ↓ and Enter to open — Esc to close.", side: "right" },
        ],
        tips: ["The first result is always “Create task …” — a fast way to capture a to-do without leaving the page."],
      },
    ],
  },
  {
    id: "tasks",
    title: "Tasks",
    icon: "✅",
    blurb: "Create, assign, discuss and finish work.",
    articles: [
      {
        id: "tasks-board",
        title: "Tasks page: list, board and filters",
        audience: "Everyone",
        summary:
          "Tasks shows everyone's work. Switch between a list and a drag-and-drop board, and narrow it down with quick views and filters.",
        shot: "tasks-board",
        callouts: [
          { spot: "toggle", title: "List or Board", body: "The board groups tasks by status. Your choice is remembered.", side: "left" },
          { spot: "newtask", title: "+ New Task", body: "Opens the full task form (see next article).", side: "bottom" },
          { spot: "ai", title: "New task with AI", body: "Paste an email, chat or screenshot — AI drafts the title, priority and due date for you to review.", side: "bottom" },
          { spot: "quick", title: "Quick views", body: "One click for Assigned to me, Collaborating, Blocked or Watching. “Save view” keeps your current filters.", side: "left" },
          { spot: "filters", title: "Filters & export", body: "Search by title or TM-ID, filter by status, person or project, then Export to CSV.", side: "left" },
          { spot: "card", title: "Drag a card", body: "Drag between columns to change status. Click a card to open it.", side: "inside" },
          { spot: "column", title: "Status columns", body: "To Do → In Progress → In Review → Done. Counts update live.", side: "inside" },
        ],
      },
      {
        id: "create-task",
        title: "Create and assign a task",
        audience: "Everyone",
        summary: "Only the title is required — fill in the rest when it helps.",
        shot: "task-new",
        callouts: [
          { spot: "title", title: "Title", body: "Start with a verb: “Prepare Diwali gift-box pricing”.", side: "top" },
          { spot: "assignee", title: "Assignee", body: "Who owns it. They get a notification (and email, if enabled).", side: "top" },
          { spot: "collaborators", title: "Collaborators", body: "Others who can work on and complete it with the assignee.", side: "left" },
          { spot: "due", title: "Due date", body: "Drives reminders, the calendar, overdue flags and the workload view.", side: "left" },
          { spot: "repeat", title: "Repeat", body: "Daily, weekly or monthly — a fresh copy is created every period automatically.", side: "right" },
          { spot: "review", title: "Review required", body: "The assignee can't mark it Done; they send it to Review and you approve.", side: "left" },
          { spot: "submit", title: "Create task", body: "Saved and notified instantly.", side: "right" },
        ],
        tips: ["Add an Estimate (e.g. “3h” or “1h 30m”) so managers can see workload and you can compare it with time actually logged."],
      },
      {
        id: "task-detail",
        title: "Work on a task",
        audience: "Everyone",
        summary: "Open any task to see everything about it, change its status and track time.",
        shot: "task-detail",
        callouts: [
          { spot: "actions", title: "Actions", body: "Watch for updates, share a link, send a reminder, edit, duplicate or delete (deleted tasks go to the Recycle bin).", side: "bottom" },
          { spot: "details", title: "Details", body: "Project, assignee, dates and estimate. Click the project to jump to it.", side: "left" },
          { spot: "collab", title: "Collaborators", body: "Add teammates who share the work — everyone listed can complete the task.", side: "left" },
          { spot: "status", title: "Status", body: "Click to move the task along. A 🔒 on Done means it needs a reviewer's approval first.", side: "left" },
          { spot: "timer", title: "Time tracking", body: "Start the timer when you begin — it logs your hours to the timesheet for you.", side: "left" },
        ],
      },
      {
        id: "comments",
        title: "Comment, mention and attach files",
        audience: "Everyone",
        summary: "Keep all conversation and files about a task on the task itself.",
        shot: "task-comments",
        callouts: [
          { spot: "attachments", title: "Attachments", body: "Attach files up to 50 MB, paste a screenshot with Ctrl/⌘ + V, or add a Drive link for bigger files.", side: "left" },
          { spot: "comments", title: "Discussion", body: "Everyone on the task sees the thread. Newest at the bottom.", side: "inside" },
          { spot: "commentbox", title: "Write a comment", body: "Type @ and a name to mention someone — they get notified straight away.", side: "left" },
        ],
      },
      {
        id: "my-tasks",
        title: "My Tasks: your personal to-do list",
        audience: "Everyone",
        summary: "Only the tasks assigned to you or that you collaborate on, grouped by when they're due.",
        shot: "my-tasks",
        callouts: [
          { spot: "tabs", title: "Filter", body: "All, only assigned to you, or only ones you collaborate on.", side: "bottom" },
          { spot: "circle", title: "Tick it off", body: "Click the circle to mark a task done (or send it to review if approval is needed).", side: "left" },
          { spot: "row", title: "Open a task", body: "Click the title for full details, comments and the timer.", side: "bottom" },
        ],
      },
      {
        id: "recurring",
        title: "Recurring tasks tracker",
        audience: "Everyone",
        summary:
          "Daily, weekly and monthly jobs (like a daily sales report) regenerate automatically. This page shows, day by day, whether each one was done.",
        shot: "recurring",
        callouts: [
          { spot: "people", title: "Pick a person", body: "See one person's routine jobs, or everyone's.", side: "bottom" },
          { spot: "stats", title: "Today's score", body: "How many are done today, and the month's done/missed totals.", side: "bottom" },
          { spot: "grid", title: "Day-by-day grid", body: "✓ done, ✕ missed, • due today. Hover a cell for details.", side: "inside" },
        ],
        tips: ["An occurrence that isn't finished by the end of its period is marked missed and a fresh one is created — no pile-up of duplicates."],
      },
    ],
  },
  {
    id: "time",
    title: "Time tracking",
    icon: "⏱️",
    blurb: "Timers, timesheets and weekly approval.",
    articles: [
      {
        id: "timer",
        title: "Use the task timer",
        audience: "Everyone",
        summary:
          "Press ▶ Start timer on a task when you begin. The clock keeps running while you move around the app, and Stop & log turns it into a timesheet entry.",
        shot: "timer-running",
        callouts: [
          { spot: "pill", title: "Always visible", body: "The running timer sits in the top bar on every page — click it to jump back to the task.", side: "bottom" },
          { spot: "clock", title: "Live clock", body: "Counts up while you work.", side: "bottom" },
          { spot: "stop", title: "Stop & log", body: "Saves the elapsed time to your timesheet (rounded to the minute).", side: "bottom" },
          { spot: "discard", title: "Discard", body: "Throws the timer away without logging anything — for when you started it by mistake.", side: "bottom" },
        ],
        tips: [
          "Only one timer runs at a time. Starting another task's timer logs the first one and switches over.",
          "Starting a timer moves a To Do task to In Progress; completing a task stops its timer automatically.",
          "Forgot to stop it? If your browser is closed or your laptop is shut down, the timer stops itself after 15 minutes and logs time only up to when you were last active. You'll get a notification so you can adjust it.",
        ],
      },
      {
        id: "timesheet",
        title: "Log time manually",
        audience: "Everyone",
        summary: "Worked away from the app? Add an entry on the Time sheet page.",
        shot: "timesheet",
        callouts: [
          { spot: "range", title: "Date range", body: "This week, last week, this month, 30 days — or pick any From/To dates.", side: "bottom" },
          { spot: "startend", title: "From / To", body: "Give a start and end time and hours are worked out for you…", side: "bottom" },
          { spot: "hours", title: "…or just Hours", body: "Type “2h 30m”, “2.5” or “150m”.", side: "bottom" },
          { spot: "task", title: "Task / Project", body: "Link the time so it shows up on the task and in project reports.", side: "bottom" },
          { spot: "log", title: "Log time", body: "Entries appear in the table below, where you can edit or delete them.", side: "right" },
          { spot: "team", title: "Team timesheet", body: "Managers: everyone's hours and approvals.", side: "left" },
        ],
      },
      {
        id: "submit-week",
        title: "Submit your week for approval",
        audience: "Everyone",
        summary: "At the end of the week, send your timesheet to your manager.",
        shot: "timesheet-submit",
        callouts: [
          { spot: "submit", title: "Submit week for approval", body: "Choose “This week” first. Once submitted the week is locked — you can Withdraw it while it's still pending.", side: "left" },
          { spot: "entries", title: "Check your entries", body: "Make sure every day adds up before you submit.", side: "inside" },
        ],
        tips: ["If your manager requests changes, the week unlocks again: fix the entries and submit once more."],
      },
    ],
  },
  {
    id: "projects",
    title: "Projects & planning",
    icon: "📁",
    blurb: "Group work into projects and plan it on the calendar.",
    articles: [
      {
        id: "projects",
        title: "Projects",
        audience: "Everyone",
        summary: "A project groups related tasks, members and time. Progress is calculated automatically.",
        shot: "projects",
        callouts: [
          { spot: "newproject", title: "+ New Project", body: "Name, description, company and members — or start from a template.", side: "left" },
          { spot: "card", title: "Project card", body: "Status, progress bar and member count. Click to open.", side: "right" },
        ],
      },
      {
        id: "project-detail",
        title: "Inside a project",
        audience: "Everyone",
        summary: "Everything for one project on one page.",
        shot: "project-detail",
        callouts: [
          { spot: "progress", title: "Progress", body: "Done vs. total tasks, updated as work is completed.", side: "bottom" },
          { spot: "template", title: "Save as template", body: "Reuse this project's task list next time — due dates are set relative to the start.", side: "left" },
          { spot: "addtask", title: "+ Add task", body: "Creates a task already linked to this project.", side: "top" },
          { spot: "tasks", title: "Task list", body: "Every task with its owner, priority, status and due date.", side: "inside" },
        ],
      },
      {
        id: "calendar",
        title: "Calendar",
        audience: "Everyone",
        summary: "All due dates on a month grid. Drag a task to another day to reschedule it.",
        shot: "calendar",
        callouts: [
          { spot: "scope", title: "My tasks / Everyone", body: "Your own work, or the whole team's.", side: "bottom" },
          { spot: "month", title: "Change month", body: "Use the arrows to move between months.", side: "bottom" },
          { spot: "filters", title: "Filters", body: "Narrow by person, project, status or priority.", side: "inside" },
          { spot: "chip", title: "Task chips", body: "Colour shows priority. Drag to a new day to change the due date.", side: "bottom" },
        ],
      },
    ],
  },
  {
    id: "communication",
    title: "Chat & notifications",
    icon: "💬",
    blurb: "Direct messages, group chats and your inbox.",
    articles: [
      {
        id: "messages",
        title: "Direct messages with auto-translation",
        audience: "Everyone",
        summary:
          "One-to-one chat with anyone in the company. Messages are translated into each person's preferred language automatically.",
        shot: "messages",
        callouts: [
          { spot: "newchat", title: "Start a chat", body: "Click + and pick a colleague.", side: "bottom" },
          { spot: "list", title: "Conversations", body: "Unread chats are bold with a count. Filter to Unread only.", side: "inside" },
          { spot: "translated", title: "Translated message", body: "Sara wrote in Arabic — Priya reads it in English. Hover to “Show original”.", side: "bottom" },
          { spot: "composer", title: "Write a message", body: "Attach files, paste screenshots, react with emoji, reply to a specific message.", side: "top" },
        ],
        tips: ["Use the 📹 Call button at the top of a chat to start a video call — no separate meeting link needed."],
      },
      {
        id: "groups",
        title: "Group chats (Discussion)",
        audience: "Everyone",
        summary: "WhatsApp-style groups for teams, projects or announcements.",
        shot: "discussion",
        callouts: [
          { spot: "newgroup", title: "Create a group", body: "Name it and add members.", side: "bottom" },
          { spot: "groups", title: "Your groups", body: "Every group you're a member of, newest activity first.", side: "right" },
          { spot: "thread", title: "Group messages", body: "Replies, reactions, stars and attachments work just like direct messages.", side: "right" },
          { spot: "composer", title: "Message the group", body: "Everyone in the group is notified.", side: "top" },
        ],
      },
      {
        id: "inbox",
        title: "Inbox (notifications)",
        audience: "Everyone",
        summary: "Everything that happened to your tasks and timesheets, grouped by task.",
        shot: "inbox",
        callouts: [
          { spot: "tabs", title: "All / Unread", body: "Show just what's new.", side: "bottom" },
          { spot: "markall", title: "Mark all read", body: "Clear the badge in one click.", side: "left" },
          { spot: "item", title: "Open the item", body: "Click to go straight to the task or page it's about.", side: "bottom" },
        ],
      },
    ],
  },
  {
    id: "notes-files",
    title: "Notes & documents",
    icon: "🗂️",
    blurb: "Personal notes, checklists and the shared file library.",
    articles: [
      {
        id: "notes",
        title: "Notes and checklists",
        audience: "Everyone",
        summary: "Private notes, Google-Keep style. Share one to collaborate.",
        shot: "notes",
        callouts: [
          { spot: "take", title: "Take a note…", body: "Click to write. The icon on the right starts a checklist instead.", side: "bottom" },
          { spot: "pinned", title: "Pinned", body: "Pin important notes to keep them on top. Checklists show progress (2/5).", side: "right" },
          { spot: "other", title: "Colour & share", body: "Open a note to change its colour, share it with teammates or attach files.", side: "bottom" },
        ],
      },
      {
        id: "documents",
        title: "Documents",
        audience: "Everyone",
        summary: "Every file and link shared in the company, in one searchable list.",
        shot: "documents",
        callouts: [
          { spot: "attach", title: "Attach file", body: "Upload up to 50 MB, or drop / paste a file anywhere on the page.", side: "bottom" },
          { spot: "link", title: "Add link", body: "For big files, add a Google Drive / OneDrive link instead.", side: "bottom" },
          { spot: "table", title: "File list", body: "See which task a file belongs to, who uploaded it and when.", side: "inside" },
        ],
      },
    ],
  },
  {
    id: "managers",
    title: "For managers",
    icon: "📊",
    blurb: "Approve timesheets, balance workload and report.",
    articles: [
      {
        id: "approve-timesheets",
        title: "Approve timesheets",
        audience: "Managers",
        summary: "Time sheet → Team timesheet lists every submitted week waiting for you.",
        shot: "timesheet-team",
        callouts: [
          { spot: "pending", title: "Pending approvals", body: "Each submitted week with total hours.", side: "inside" },
          { spot: "approve", title: "Approve", body: "Locks the week. The employee is notified.", side: "bottom" },
          { spot: "approveall", title: "Approve all", body: "Approve every pending week in one click.", side: "left" },
          { spot: "export", title: "Export", body: "Download everyone's hours as CSV for payroll or billing.", side: "left" },
        ],
        tips: ["Use “Request changes” with a short reason to send a week back — it unlocks so they can fix it."],
      },
      {
        id: "person-hours",
        title: "Check one person's hours and edit history",
        audience: "Managers",
        summary: "Click View next to someone on the Team timesheet.",
        shot: "timesheet-person",
        callouts: [
          { spot: "byproject", title: "By project", body: "Where their time went in the selected range.", side: "top" },
          { spot: "history", title: "Change history", body: "Every add, edit, delete and timer stop — including timers the system stopped automatically.", side: "top" },
        ],
      },
      {
        id: "workload",
        title: "Balance the workload",
        audience: "Managers",
        summary: "Estimated hours due per person per day, against a ~40h week.",
        shot: "workload",
        callouts: [
          { spot: "filters", title: "Filter", body: "By person, company or department — or tick “Over capacity only”.", side: "inside" },
          { spot: "week", title: "Pick a week", body: "Plan ahead with Next week.", side: "bottom" },
          { spot: "grid", title: "Daily load", body: "Blue ≤ 4h, amber ≤ 8h, red > 8h. The green chip shows what someone is timing right now.", side: "inside" },
        ],
      },
      {
        id: "reports",
        title: "Reports",
        audience: "Managers",
        summary: "Task and time overview for the team, with CSV exports.",
        shot: "reports",
        callouts: [
          { spot: "exports", title: "Export CSV", body: "Tasks or timesheet for the current filters.", side: "left" },
          { spot: "filters", title: "Filters", body: "Person, company, department and time window.", side: "inside" },
          { spot: "stats", title: "Headline numbers", body: "Total, by status and overdue — followed by throughput, on-time rate and per-person breakdowns.", side: "bottom" },
        ],
      },
    ],
  },
  {
    id: "admins",
    title: "For admins",
    icon: "🔐",
    blurb: "People, departments and settings for the whole company.",
    articles: [
      {
        id: "users",
        title: "Add and manage users",
        audience: "Admins",
        summary: "Admin → Users. Only admins see this page.",
        shot: "users",
        callouts: [
          { spot: "add", title: "+ Add User", body: "Name, email, role, company and department. They must change the temporary password at first sign-in.", side: "left" },
          { spot: "bulk", title: "Bulk import", body: "Upload a CSV to add many people at once (a template is provided).", side: "left" },
          { spot: "table", title: "Everyone", body: "Edit roles, see who's active now, or deactivate someone who has left — their history is kept.", side: "inside" },
        ],
        tips: [
          "Roles: Employee (own work), Manager (team views, approvals, workload, reports), Admin (everything, including users and billing).",
          "Departments are managed under Admin → Departments; deleted items can be restored from the Recycle bin.",
        ],
      },
    ],
  },
  {
    id: "mobile",
    title: "On your phone",
    icon: "📱",
    blurb: "The whole app works in your phone's browser.",
    articles: [
      {
        id: "mobile",
        title: "Use it on mobile",
        audience: "Everyone",
        summary:
          "Open task.donetella.com in Chrome or Safari on your phone. Choose “Add to Home Screen” to get an app icon and notifications.",
        shot: "mobile",
        callouts: [
          { spot: "menu", title: "Menu", body: "Opens the full sidebar.", side: "bottom" },
          { spot: "newtask", title: "New Task", body: "Capture a task on the go.", side: "bottom" },
          { spot: "circle", title: "Done", body: "Tick off tasks with one tap.", side: "inside" },
        ],
      },
    ],
  },
];

export const FAQS: { q: string; a: string }[] = [
  {
    q: "I forgot to stop my timer — what happens?",
    a: "If your browser was closed or your laptop shut down, the timer stops itself after 15 minutes of no activity and logs time only up to when you were last active. You'll get a notification; adjust the entry on the Time sheet if needed.",
  },
  {
    q: "Why can't I mark a task Done?",
    a: "The task (or your account) requires review. Move it to In Review — the person who assigned it approves it, and you're notified.",
  },
  {
    q: "Why can't I edit my timesheet?",
    a: "That week is submitted or approved, so it's locked. Withdraw it while it's still pending, or ask your manager to request changes.",
  },
  {
    q: "I deleted something by mistake.",
    a: "Deleted tasks go to the Recycle bin first. Ask an admin to restore it.",
  },
  {
    q: "My account says “too many failed sign-in attempts”.",
    a: "After 5 wrong passwords the account pauses for 15 minutes to block password guessing. Wait, then try again — or use “Forgot password”.",
  },
  {
    q: "How do I get notifications on my phone?",
    a: "Open the app in your phone's browser, add it to your home screen, and allow notifications when asked.",
  },
];

export const QUICK_STARTS: { audience: Audience; title: string; icon: string; steps: { label: string; href: string }[] }[] = [
  {
    audience: "Everyone",
    title: "New to the team",
    icon: "👋",
    steps: [
      { label: "Sign in & change your password", href: "#sign-in" },
      { label: "Set your photo and language", href: "#profile" },
      { label: "Check My Tasks every morning", href: "#my-tasks" },
      { label: "Start the timer when you work", href: "#timer" },
      { label: "Submit your week on Friday", href: "#submit-week" },
    ],
  },
  {
    audience: "Managers",
    title: "Running a team",
    icon: "🧭",
    steps: [
      { label: "Create and assign tasks", href: "#create-task" },
      { label: "Balance the workload", href: "#workload" },
      { label: "Approve timesheets", href: "#approve-timesheets" },
      { label: "Review reports", href: "#reports" },
    ],
  },
  {
    audience: "Admins",
    title: "Setting it up",
    icon: "🛠️",
    steps: [
      { label: "Add users (or bulk import)", href: "#users" },
      { label: "Create projects", href: "#projects" },
      { label: "Set up recurring jobs", href: "#recurring" },
    ],
  },
];
