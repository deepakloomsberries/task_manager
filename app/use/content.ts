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
        id: "welcome",
        title: "Your first-week checklist",
        audience: "Everyone",
        summary:
          "For your first month, the Dashboard shows a short “Getting started” checklist. Steps tick themselves off as you do them.",
        shot: "welcome",
        callouts: [
          { spot: "checklist", title: "Getting started", body: "Your progress bar and the steps left. Admins and managers get a few extra steps (add your team, approve a timesheet).", side: "inside" },
          { spot: "step", title: "Do the step", body: "Click a step to go straight to the right page.", side: "left" },
          { spot: "showme", title: "Show me how", body: "Opens the matching part of this guide in a new tab.", side: "left" },
          { spot: "guide", title: "5-minute guide", body: "The quick-start path for new people.", side: "bottom" },
          { spot: "dismiss", title: "Dismiss", body: "Hide the checklist once you're comfortable. It also disappears when everything's done.", side: "bottom" },
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
        tips: [
          "🌙 in the top bar switches dark mode; ⇤ collapses the sidebar for more room.",
          "Press ? on any page for help with that page.",
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
      {
        id: "help-menu",
        title: "Get help on any page",
        audience: "Everyone",
        summary:
          "Stuck? The ? button in the top bar always knows which page you're on and opens the right part of this guide.",
        shot: "help-menu",
        callouts: [
          { spot: "button", title: "Help button", body: "Click it — or just press the ? key anywhere (outside a text box).", side: "left" },
          { spot: "thispage", title: "Help for this page", body: "Jumps straight to the guide article for the screen you're looking at.", side: "left" },
          { spot: "related", title: "Related guides", body: "Other things people usually do on this page.", side: "left" },
          { spot: "full", title: "Full guide", body: "Getting started, shortcuts, what's new and troubleshooting are one click away.", side: "left" },
          { spot: "sidebar", title: "Help & guide in the sidebar", body: "Always at the bottom of the menu, on desktop and phone.", side: "right" },
        ],
      },
      {
        id: "search-results",
        title: "Full search results",
        audience: "Everyone",
        summary:
          "Press Enter in the ⌘K search (or choose “Search everything”) to see every match, grouped by type.",
        shot: "search-results",
        callouts: [
          { spot: "tasks", title: "Tasks", body: "With project, owner, due date and status.", side: "left" },
          { spot: "docs", title: "Documents", body: "Files and links whose name matches.", side: "left" },
          { spot: "notes", title: "Your notes", body: "Only your own (and shared) notes — nobody else can find your private notes.", side: "left" },
        ],
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
        id: "ai-task",
        title: "Draft a task with AI",
        audience: "Everyone",
        summary:
          "Turn an email, WhatsApp message or screenshot into a task in seconds. AI fills in the details; nothing is saved until you check it.",
        shot: "ai-task",
        callouts: [
          { spot: "box", title: "Paste anything", body: "An email, a chat message — or paste a screenshot with Ctrl/⌘ + V.", side: "bottom" },
          { spot: "draft", title: "Draft with AI", body: "You get an editable form with title, description, priority, due date and assignee filled in.", side: "left" },
          { spot: "close", title: "Close", body: "Changed your mind? Nothing has been created yet.", side: "bottom" },
        ],
        tips: ["Always read the draft before pressing Create — AI can misread dates or names."],
      },
      {
        id: "import-tasks",
        title: "Import tasks from a spreadsheet",
        audience: "Managers",
        summary: "Create or update dozens of tasks at once from Excel or CSV. You see a preview before anything changes.",
        shot: "import-tasks",
        callouts: [
          { spot: "columns", title: "Supported columns", body: "Title is the only required one. Add a TM-ID column to update existing tasks instead of creating new ones.", side: "inside" },
          { spot: "template", title: "Blank template", body: "Download a ready-made sheet with the right headings.", side: "left" },
          { spot: "file", title: "Choose your file", body: ".xlsx, .xls or .csv.", side: "bottom" },
          { spot: "preview", title: "Preview, then confirm", body: "Shows exactly what will be created or updated, and any rows with problems.", side: "bottom" },
        ],
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
        id: "task-tags",
        title: "Tags, and why Done is sometimes locked",
        audience: "Everyone",
        summary: "Tags group tasks across projects. A 🔒 on Done means something has to happen first.",
        shot: "task-tags",
        callouts: [
          { spot: "tags", title: "Status, priority & tags", body: "Tags are coloured labels; click × to remove one. Filter the Tasks page by tag.", side: "left" },
          { spot: "addtag", title: "+ tag", body: "Type a new or existing tag name.", side: "left" },
          { spot: "blocked", title: "⛔ Blocked", body: "This task is waiting on another unfinished task (see Dependencies below).", side: "right" },
          { spot: "done", title: "Done 🔒", body: "Locked while it's blocked, has open subtasks, or needs a reviewer's approval. Hover to see why.", side: "right" },
        ],
      },
      {
        id: "subtasks",
        title: "Subtasks and dependencies",
        audience: "Everyone",
        summary: "Break big work into subtasks, and mark tasks that can't start until another one is finished.",
        shot: "subtasks",
        callouts: [
          { spot: "blocker", title: "Blocked by", body: "The task that has to be finished first. The ⛔ icon clears automatically when it's done.", side: "top" },
          { spot: "addblocker", title: "Add blocker", body: "Pick any task this one depends on.", side: "left" },
          { spot: "progress", title: "Subtask progress", body: "The parent task can't be marked Done until every subtask is.", side: "right" },
          { spot: "subtask", title: "Subtasks", body: "Each has its own owner. Tick the circle to complete it; add new ones below.", side: "bottom" },
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
        id: "review-approve",
        title: "Review and approve work",
        audience: "Everyone",
        summary:
          "When a task needs approval, the assignee moves it to In Review. The person who created it approves it — or sends it back.",
        shot: "review-approve",
        callouts: [
          { spot: "inreview", title: "In Review", body: "The assignee has finished and is waiting for you. You'll find these under “To review” on your Dashboard.", side: "bottom" },
          { spot: "approve", title: "Approve", body: "Marks it Done and notifies the assignee.", side: "bottom" },
          { spot: "todo", title: "Send back", body: "Not right yet? Move it back to To Do or In Progress and leave a comment saying what to change.", side: "bottom" },
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
        id: "backdate",
        title: "Forgot to start the timer?",
        audience: "Everyone",
        summary: "Start it from when you really began — up to 8 hours back — instead of fixing the timesheet later.",
        shot: "backdate",
        callouts: [
          { spot: "toggle", title: "⏪ Started earlier?", body: "Next to the Start timer button on every task.", side: "bottom" },
          { spot: "minutes", title: "How long ago", body: "Pick 5 minutes up to 4 hours.", side: "bottom" },
          { spot: "startthen", title: "Start from then", body: "The clock starts already counting. If you were timing another task, that one is logged up to the same moment.", side: "bottom" },
        ],
      },
      {
        id: "still-working",
        title: "“Still working on this?” reminders",
        audience: "Everyone",
        summary:
          "If a timer has been running for 4 hours, the app checks with you — so a forgotten timer doesn't run all night.",
        shot: "welcome",
        callouts: [
          { spot: "pill", title: "Timer turns amber", body: "After 4 hours the top-bar timer changes colour as a first hint.", side: "bottom" },
          { spot: "prompt", title: "Still working?", body: "A card appears (and a desktop notification, if you've allowed them).", side: "left" },
          { spot: "keep", title: "Yes, keep going", body: "Hides the reminder for 2 hours.", side: "left" },
          { spot: "stopnow", title: "Stop & log", body: "Stops the timer and logs the time. Then fix the hours on your Time sheet if you'd stopped earlier.", side: "top" },
        ],
        tips: ["Nothing is ever stopped without your click here. (Timers do stop on their own when the browser is closed or the laptop is shut down.)"],
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
        tips: [
          "If your manager requests changes, the week unlocks again: fix the entries and submit once more.",
          "Forgot? On Friday afternoon you'll get a reminder (in the app and by email) if the week hasn't been submitted.",
        ],
      },
    ],
  },
  {
    id: "leave-calendar",
    title: "Leave & calendar",
    icon: "🌴",
    blurb: "Time off, office holidays, and your tasks in Google Calendar.",
    articles: [
      {
        id: "leave",
        title: "Request leave",
        audience: "Everyone",
        summary:
          "Ask for time off from the Leave page. Weekends and office holidays inside your dates aren't counted, and your manager gets a notification to approve it.",
        shot: "leave",
        callouts: [
          { spot: "summary", title: "Your year so far", body: "Days of leave approved this year, by type, and anything still waiting for approval.", side: "inside" },
          { spot: "type", title: "Leave type", body: "Annual, sick, casual, unpaid or other.", side: "right" },
          { spot: "dates", title: "From / To", body: "Leave “To” empty for a single day. Days are counted for your own office's weekend.", side: "right" },
          { spot: "halfday", title: "Half day", body: "For a single morning or afternoon — counts as 0.5.", side: "right" },
          { spot: "send", title: "Send request", body: "Managers are notified straight away; you're notified when they decide.", side: "right" },
          { spot: "requests", title: "My requests", body: "Status, who approved it, and any note from them.", side: "inside" },
          { spot: "withdraw", title: "Withdraw / Cancel", body: "Withdraw a pending request, or cancel approved leave that hasn't started.", side: "left" },
        ],
        tips: [
          "While you're on leave you won't get the daily due-task email or the Friday timesheet reminder, and your daily recurring jobs aren't marked as missed.",
          "Everyone can see who's off today on their Dashboard, and a banner on a task tells people when its assignee is away.",
        ],
      },
      {
        id: "approve-leave",
        title: "Approve leave & see who's off",
        audience: "Managers",
        summary: "Leave → Team lists every pending request and a three-week view of who's away.",
        shot: "leave-team",
        callouts: [
          { spot: "badge", title: "Pending count", body: "The Leave menu item shows how many requests are waiting for you.", side: "right" },
          { spot: "pending", title: "Waiting for approval", body: "Type, dates, working days and the reason.", side: "inside" },
          { spot: "approve", title: "Approve", body: "The person is notified and it appears on calendars, Workload and the Dashboard.", side: "bottom" },
          { spot: "decline", title: "Decline", body: "Add a short reason so they know what to change.", side: "bottom" },
          { spot: "grid", title: "Who's off — next 21 days", body: "One row per person. Faded = still pending; grey = their weekend or an office holiday.", side: "inside" },
        ],
        tips: ["You can't approve your own leave — another manager or an admin does that. Admins' own leave is booked directly."],
      },
      {
        id: "holidays",
        title: "Holidays & weekends",
        audience: "Admins",
        summary: "Set each office's public holidays and weekend days. They're skipped when leave is counted and shown on everyone's calendar.",
        shot: "holidays",
        callouts: [
          { spot: "list", title: "Holidays this year", body: "Each shows which office it applies to. Use the arrows to plan next year.", side: "inside" },
          { spot: "add", title: "Add a holiday", body: "Pick a date and a name.", side: "inside" },
          { spot: "office", title: "Which office", body: "One office (IND, UAE, KSA) or all of them.", side: "left" },
          { spot: "weekend", title: "Weekend days", body: "E.g. India Sunday, UAE Saturday + Sunday, KSA Friday + Saturday. Tick and Save.", side: "inside" },
        ],
      },
      {
        id: "calendar-sync",
        title: "See your tasks in Google Calendar",
        audience: "Everyone",
        summary:
          "Subscribe once and your task due dates, your leave and your office's holidays appear in Google Calendar — and stay up to date on their own.",
        shot: "calendar-sync",
        callouts: [
          { spot: "google", title: "Add to Google Calendar", body: "Opens Google Calendar with the subscription ready — click Add. (First click “Create my calendar link” in Settings.)", side: "bottom" },
          { spot: "other", title: "Outlook or Apple Calendar", body: "Opens your computer's or phone's calendar app with the same feed.", side: "bottom" },
          { spot: "link", title: "Your private link", body: "Or copy it: Google Calendar → ＋ next to Other calendars → From URL → paste.", side: "top" },
          { spot: "reset", title: "Reset link", body: "If the link was shared by mistake — the old one stops working immediately.", side: "right" },
        ],
        tips: [
          "Google refreshes subscribed calendars every few hours, so a change here can take a while to show there.",
          "The sync is one-way: change dates in this app, not in Google Calendar.",
          "Just one task? Open it and click “＋ Google Calendar” under its due date.",
        ],
      },
    ],
  },
  {
    id: "planning",
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
        id: "templates",
        title: "Project templates",
        audience: "Managers",
        summary:
          "Set up a reusable task list once — e.g. “New marketplace launch” — and start every similar project from it.",
        shot: "templates",
        callouts: [
          { spot: "create", title: "Create a template", body: "Give it a name and description.", side: "bottom" },
          { spot: "row", title: "Your templates", body: "Each shows how many tasks it contains.", side: "left" },
          { spot: "edit", title: "Edit tasks", body: "Add tasks with a priority and “due N days after the project starts”.", side: "left" },
        ],
        tips: ["Shortcut: open an existing project and click “Save as template” to copy its task list."],
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
        id: "status",
        title: "Set your status (Available, Busy, In a meeting…)",
        audience: "Everyone",
        summary:
          "Like Microsoft Teams: the dot on your photo tells colleagues whether you're around. It's automatic, or you can pick a status and add a message.",
        shot: "status-menu",
        callouts: [
          { spot: "button", title: "Your photo, top right", body: "Click it to open the status menu. Your current status shows under your name.", side: "left" },
          { spot: "choices", title: "Pick a status", body: "Available (automatic), Busy, In a meeting, Do not disturb, Away or Appear offline.", side: "left" },
          { spot: "dnd", title: "Do not disturb", body: "Notifications still land in your Inbox, but there are no pop-ups.", side: "left" },
          { spot: "message", title: "Status message", body: "e.g. “Back at 3pm” or “At the factory” — shown next to your status everywhere.", side: "left" },
          { spot: "clear", title: "Clear after", body: "30 minutes, 1 or 2 hours, today or this week — then it goes back to automatic.", side: "left" },
        ],
        tips: [
          "Automatic: green when you're using the app, yellow (Away) when it's open in the background, grey when you're signed out.",
          "Approved leave shows a purple “On leave” dot — no need to set anything.",
          "Colleagues see your status on your photo in chats, task pages, the Dashboard and your profile.",
        ],
      },
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
        id: "video-calls",
        title: "Video calls",
        audience: "Everyone",
        summary:
          "Start a video call from any chat or group — no meeting link or extra app needed. Everyone in the conversation gets a ring.",
        tips: [
          "Open a chat and click 📹 Call in the top-right corner.",
          "Allow camera and microphone when your browser asks. On a phone, use Chrome or Safari.",
          "Calls work best on office Wi-Fi; if video freezes, turn your camera off and keep the audio.",
        ],
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
      {
        id: "notification-settings",
        title: "Choose your notifications",
        audience: "Everyone",
        summary: "In-app notifications are always on. You choose whether you also get emails.",
        shot: "notification-settings",
        callouts: [
          { spot: "email", title: "Email notifications", body: "Assignments, comments, reminders and team leave announcements. Untick to stop emails.", side: "right" },
          { spot: "save", title: "Save preferences", body: "Takes effect straight away.", side: "right" },
        ],
        tips: [
          "Browser pop-ups: allow notifications when the app asks, so you're alerted even when the tab is in the background.",
          "Morning summary email: each working day at 8am — your overdue and due-today tasks, what's waiting for your approval, and who's off today and this week. Turn it off with its own tick box.",
          "When someone's leave is approved, everyone gets a short email with the dates (never the reason or the leave type).",
          "On Friday afternoon you'll get a reminder if this week's timesheet hasn't been submitted yet.",
          "Further down Settings: Calendar sync (Google Calendar) and Change password.",
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
    id: "clients",
    title: "Client portal",
    icon: "🤝",
    blurb: "Let buyers follow their projects, download files and approve work — without seeing anything internal.",
    articles: [
      {
        id: "clients-setup",
        title: "Give a client portal access",
        audience: "Managers",
        summary:
          "Add the client, give their people a login, and link their projects. Clients have their own sign-in and never appear in your team's lists.",
        shot: "clients",
        callouts: [
          { spot: "add", title: "1. Add the client", body: "Type the company name and click ＋ Add client.", side: "bottom" },
          { spot: "projects", title: "2. Link their projects", body: "Pick a project from “Link a project…”. You can also set the client on the project page.", side: "right" },
          { spot: "people", title: "3. Add their people", body: "Name, email and a temporary password (use Generate). They get an email with the portal link.", side: "left" },
          { spot: "link", title: "Portal link", body: "Clients sign in at /portal — copy it to send along.", side: "bottom" },
        ],
        tips: [
          "Linking a project shows nothing on its own — share the tasks next (see the next article).",
          "“Turn off access” blocks a person straight away; “Reset password” emails them a new temporary one.",
        ],
      },
      {
        id: "client-share",
        title: "Share tasks with a client and reply to them",
        audience: "Managers",
        summary:
          "Only tasks you share are visible to the client. They see the title, description, status, due date and files — never the internal discussion, time or subtasks.",
        shot: "client-panel",
        callouts: [
          { spot: "share", title: "Share / Hide", body: "Shows or hides this task in the portal. On the project page, “Share all” does every task at once.", side: "left" },
          { spot: "convo", title: "Client conversation", body: "Separate from the internal Discussion. Client messages are on the right.", side: "top" },
          { spot: "reply", title: "Reply", body: "Your reply is emailed to the client's people.", side: "top" },
        ],
        tips: [
          "When a shared task is marked Done, the client is emailed to approve it.",
          "The client's sign-off (✅ Approved or ✏️ Changes requested) shows on the task, and the task owner and assignee are notified.",
          "Shared tasks have a 👁 next to their title on the project page.",
        ],
      },
      {
        id: "client-portal",
        title: "What the client sees",
        audience: "Everyone",
        summary: "A simple, separate site: their projects with progress, the shared steps, files to download, and approve / request changes.",
        shot: "portal",
        callouts: [
          { spot: "waiting", title: "Waiting for your approval", body: "Finished steps they haven't signed off yet.", side: "bottom" },
          { spot: "project", title: "Their projects", body: "Progress bar and the next step that's due.", side: "right" },
        ],
        tips: [
          "In Review shows to clients as “Final checks” — they're asked to approve only once the task is Done.",
          "Asking for changes needs a comment, so the team knows what to fix.",
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
        id: "people-profile",
        title: "Someone's profile page",
        audience: "Managers",
        summary: "Click anyone's name or avatar to see their workload, output and what they're doing right now.",
        shot: "people-profile",
        callouts: [
          { spot: "message", title: "Message", body: "Start a chat (or email them) straight from their profile.", side: "bottom" },
          { spot: "manage", title: "Manage account", body: "Admins: change role, department, reset password or deactivate.", side: "left" },
          { spot: "stats", title: "At a glance", body: "Open and overdue tasks, completions, on-time rate and hours this week.", side: "left" },
          { spot: "now", title: "Working on now", body: "Their running timer, live.", side: "left" },
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
          { spot: "grid", title: "Daily load", body: "Blue ≤ 4h, amber ≤ 8h, red > 8h. 🌴 = on leave, 🎉 = holiday (a red ring means work is due while they're away). The green chip shows what someone is timing now.", side: "inside" },
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
      {
        id: "estimates",
        title: "Estimates vs actual",
        audience: "Managers",
        summary:
          "On Reports, see how long finished tasks really took compared with their estimate — per person — and which open tasks are already over.",
        shot: "reports-estimates",
        callouts: [
          { spot: "totals", title: "Overall accuracy", body: "Estimated vs logged hours for tasks finished in the window. 100% means spot on.", side: "inside" },
          { spot: "bands", title: "Faster / on target / longer", body: "On target = within about 20% of the estimate.", side: "bottom" },
          { spot: "people", title: "Per person", body: "Who estimates well and who needs more realistic plans — furthest from 100% first.", side: "inside" },
          { spot: "over", title: "Already over", body: "Open tasks that have used more time than estimated. Worth a check-in.", side: "inside" },
        ],
        tips: ["Only tasks with both an estimate and logged time are compared — so add estimates and use the timer."],
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
      {
        id: "departments",
        title: "Departments",
        audience: "Admins",
        summary: "Group people by department inside each company. Departments power the filters on Workload and Reports.",
        shot: "departments",
        callouts: [
          { spot: "add", title: "Add a department", body: "Name it and pick the company (IND, UAE, KSA…).", side: "bottom" },
          { spot: "list", title: "All departments", body: "With member counts. You can only delete a department once nobody is in it.", side: "right" },
        ],
      },
      {
        id: "billing",
        title: "Billing",
        audience: "Admins",
        summary: "Internal per-seat cost for charging back to finance, based on active users.",
        shot: "billing",
        callouts: [
          { spot: "month", title: "This month", body: "Active users × rate = projected total.", side: "inside" },
          { spot: "rate", title: "Rate", body: "Set the per-seat monthly rate and currency.", side: "inside" },
          { spot: "snapshot", title: "Generate snapshot", body: "Freezes this month's headcount and rate as a fixed record.", side: "bottom" },
          { spot: "pdf", title: "Print / Save as PDF", body: "Invoice history for finance.", side: "left" },
        ],
      },
      {
        id: "recycle-bin",
        title: "Recycle bin",
        audience: "Admins",
        summary: "Deleted tasks and notes land here first, so mistakes can be undone.",
        shot: "recycle-bin",
        callouts: [
          { spot: "search", title: "Find it", body: "Search by task title, TM-ID or note text.", side: "bottom" },
          { spot: "restore", title: "Restore", body: "Brings the task back with its subtasks, comments and time.", side: "left" },
          { spot: "forever", title: "Delete forever", body: "Permanent — there's no undo after this.", side: "bottom" },
        ],
      },
    ],
  },
  {
    id: "on-mobile",
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
    q: "My leave shows fewer days than the dates I picked.",
    a: "Weekends and office holidays inside your dates aren't counted — only working days for your own office.",
  },
  {
    q: "My tasks aren't showing in Google Calendar yet.",
    a: "Google refreshes subscribed calendars every few hours. Check the calendar is ticked under “Other calendars”; if you reset your link, add the new one.",
  },
  {
    q: "I started work but forgot to press Start.",
    a: "Open the task, click “⏪ Started earlier?”, choose how long ago you began, and press “Start from then”. Or add the time manually on your Time sheet.",
  },
  {
    q: "The app keeps asking “Still working on this?”",
    a: "Your timer has run for 4+ hours. Click “Yes, keep going” to hide it for 2 hours, or stop the timer if you'd forgotten it.",
  },
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

/** Newest first. `link` is an article id. */
export const WHATS_NEW: { date: string; title: string; body: string; link?: string }[] = [
  { date: "Sep 2026", title: "Client portal", body: "Clients get their own login to follow shared tasks, download files and approve work.", link: "clients-setup" },
  { date: "Sep 2026", title: "Set your status", body: "Available, Busy, In a meeting, Do not disturb, Away or Appear offline — with a message, like Teams.", link: "status" },
  { date: "Sep 2026", title: "Morning summary email", body: "Your day in one email, including who's off today and this week.", link: "notification-settings" },
  { date: "Sep 2026", title: "Team leave emails", body: "Everyone is emailed when someone's leave is approved (dates only).", link: "leave" },
  { date: "Sep 2026", title: "Leave & holidays", body: "Request leave, approve it, and set each office's holidays and weekends. Workload, calendars and reminders all know who's away.", link: "leave" },
  { date: "Sep 2026", title: "Google Calendar sync", body: "Your due dates, leave and holidays in Google, Outlook or Apple Calendar.", link: "calendar-sync" },
  { date: "Sep 2026", title: "Back to where you were", body: "Open a task from a project (or the calendar, My Tasks…) and “Back” returns you there after any change.", link: "task-detail" },
  { date: "Sep 2026", title: "Help on every page", body: "A ? button in the top bar (or press ?) opens the guide for the page you're on.", link: "help-menu" },
  { date: "Sep 2026", title: "Getting-started checklist", body: "New accounts see a short checklist on the Dashboard that ticks itself off.", link: "welcome" },
  { date: "Sep 2026", title: "Start a timer from earlier", body: "Forgot to press Start? Begin the timer from up to 8 hours ago.", link: "backdate" },
  { date: "Sep 2026", title: "“Still working?” reminder", body: "Timers running for 4 hours ask if you're still on the task.", link: "still-working" },
  { date: "Sep 2026", title: "Estimates vs actual", body: "Reports now compare estimated with logged hours, per person.", link: "estimates" },
  { date: "Sep 2026", title: "Friday timesheet reminder", body: "A nudge if this week's timesheet hasn't been submitted.", link: "submit-week" },
  { date: "Sep 2026", title: "Timers stop themselves", body: "Closing the browser or shutting the laptop stops and logs a running timer.", link: "timer" },
  { date: "Sep 2026", title: "Timesheet change history", body: "Managers can see every add, edit and delete on a person's time entries.", link: "person-hours" },
  { date: "Sep 2026", title: "Safer sign-in", body: "Repeated wrong passwords now pause the account for 15 minutes.", link: "sign-in" },
];

export const GLOSSARY: { term: string; meaning: string }[] = [
  { term: "Status (presence)", meaning: "The coloured dot on a photo: green Available, red Busy / In a meeting / Do not disturb, yellow Away, purple On leave, grey Offline." },
  { term: "Client portal", meaning: "The separate site (/portal) where clients see only the tasks you share with them." },
  { term: "Working day", meaning: "Not your office's weekend and not a holiday. Leave is counted in working days." },
  { term: "To Do → In Progress → In Review → Done", meaning: "A task's status. Starting a timer moves To Do to In Progress automatically." },
  { term: "Low · Medium · High · Urgent", meaning: "Priority. Urgent tasks are shown in red everywhere." },
  { term: "TM-42", meaning: "A task's ID. Type it in search (⌘K) to jump straight to the task." },
  { term: "Assignee", meaning: "The one person who owns a task." },
  { term: "Collaborator", meaning: "Someone who works on the task with the assignee and can complete it too." },
  { term: "Watcher", meaning: "Someone who gets notified about changes but doesn't work on it." },
  { term: "Review required", meaning: "The assignee can't mark it Done; the creator approves it from In Review." },
  { term: "Blocked", meaning: "Waiting on another unfinished task (a dependency)." },
  { term: "Estimate", meaning: "Expected effort in hours. Drives Workload and the estimates-vs-actual report." },
  { term: "Recurring", meaning: "A daily, weekly or monthly job that recreates itself each period." },
  { term: "Timesheet week", meaning: "Sunday to Saturday. Once submitted it's locked until approved or sent back." },
  { term: "Employee · Manager · Admin", meaning: "Roles. Managers see team views and approvals; admins also manage users and billing." },
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
