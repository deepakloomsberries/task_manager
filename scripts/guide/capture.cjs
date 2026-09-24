/**
 * Captures the screenshots for the public /use guide and records where each
 * highlighted element sits, so the guide can draw numbered arrows onto them.
 *
 * Run against a server backed by the FICTIONAL demo database (seed-demo.ts):
 *   GUIDE_URL=http://localhost:3457 node scripts/guide/capture.cjs
 * (Playwright must be resolvable, e.g. NODE_PATH=$(npm root -g).)
 *
 * Writes public/guide/<id>.jpg and app/use/shots.json (element boxes in % of
 * the image, keyed by shot id → hotspot key).
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.GUIDE_URL ?? "http://localhost:3457";
const ROOT = path.resolve(__dirname, "../..");
const OUT_IMG = path.join(ROOT, "public/guide");
const OUT_JSON = path.join(ROOT, "app/use/shots.json");
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;

const W = 1440;
const H = 900;

/** Shots: where to go, what to do first, and which elements to box. */
const SHOTS = [
  {
    id: "login", path: "/login", auth: false,
    spots: {
      email: (p) => p.locator("input[name=email]"),
      password: (p) => p.locator("input[name=password]"),
      signin: (p) => p.locator("button[type=submit]"),
      forgot: (p) => p.getByRole("link", { name: /forgot/i }),
    },
  },
  {
    id: "dashboard", path: "/dashboard",
    spots: {
      sidebar: (p) => p.locator("aside").first(),
      search: (p) => p.getByRole("button", { name: /search/i }).first(),
      bell: (p) => p.locator('header a[href="/notifications"]').first(),
      stats: (p) => p.getByText("Open (team)").locator("xpath=../../.."),
      attention: (p) => p.getByText("Needs your attention").locator("xpath=../.."),
      working: (p) => p.getByText("Working right now").locator("xpath=../.."),
      newtask: (p) => p.getByRole("link", { name: "+ New task" }),
    },
  },
  {
    id: "tasks-board", path: "/tasks?view=board",
    spots: {
      toggle: (p) => p.getByRole("link", { name: "Board", exact: true }).first().locator(".."),
      newtask: (p) => p.getByRole("link", { name: "+ New Task" }),
      ai: (p) => p.getByText("New task with AI").first(),
      quick: (p) => p.getByText("Quick view:").locator(".."),
      filters: (p) => p.getByRole("button", { name: "Apply filters" }).locator("xpath=ancestor::form[1]"),
      card: (p) => p.getByText("Finalise festive catalogue photography").first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]"),
      column: (p) => p.getByText("In Review", { exact: true }).first().locator("xpath=../.."),
    },
  },
  {
    id: "task-new", path: "/tasks?new=1",
    before: async (p) => {
      await p.locator("input[name=title]").first().fill("Prepare Diwali gift-box pricing");
    },
    spots: {
      title: (p) => p.locator("input[name=title]").first(),
      assignee: (p) => p.getByText("Assignee", { exact: true }).first().locator(".."),
      collaborators: (p) => p.getByText("Collaborators", { exact: true }).first().locator(".."),
      due: (p) => p.getByText("Due date", { exact: true }).first().locator(".."),
      repeat: (p) => p.getByText("Repeat", { exact: true }).first().locator(".."),
      review: (p) => p.getByText("Review required", { exact: true }).first().locator("xpath=../.."),
      submit: (p) => p.locator("input[name=title]").first().locator("xpath=ancestor::form[1]").locator("button[type=submit]").last(),
    },
  },
  {
    id: "task-detail", path: "/tasks/1",
    spots: {
      actions: (p) => p.getByRole("button", { name: "Edit" }).or(p.getByRole("link", { name: "Edit" })).first().locator(".."),
      details: (p) => p.getByText("Assignee", { exact: true }).first().locator("xpath=../.."),
      collab: (p) => p.getByText(/^Collaborators/).first().locator(".."),
      status: (p) => p.getByText("Status", { exact: true }).first().locator(".."),
      timer: (p) => p.getByText("Time tracking", { exact: false }).first().locator("xpath=ancestor::div[contains(@class,'card')][1]"),
    },
  },
  {
    id: "task-comments", path: "/tasks/1",
    before: async (p) => {
      await p.getByText("White-background shots done").first().scrollIntoViewIfNeeded();
      await p.evaluate(() => window.scrollBy(0, 250));
    },
    spots: {
      attachments: (p) => p.getByText("Attachments").first().locator("xpath=ancestor::div[contains(@class,'card')][1]"),
      comments: (p) => p.getByText("White-background shots done").first().locator("xpath=ancestor::div[contains(@class,'card')][1]"),
      commentbox: (p) => p.locator("textarea").first(),
    },
  },
  {
    id: "my-tasks", path: "/my-tasks",
    spots: {
      tabs: (p) => p.getByText("Assigned to me", { exact: true }).first().locator(".."),
      circle: (p) => p.getByRole("button", { name: "✓" }).first(),
      row: (p) => p.getByText("Review campaign budget").first().locator("xpath=../.."),
    },
  },
  {
    id: "timesheet", path: "/timesheet",
    spots: {
      range: (p) => p.getByRole("link", { name: "This week" }).first().locator(".."),
      form: (p) => p.getByText("Date *").first().locator("xpath=ancestor::form[1]"),
      startend: (p) => p.getByText("From", { exact: true }).nth(1).locator(".."),
      hours: (p) => p.getByText("Hours", { exact: true }).first().locator(".."),
      task: (p) => p.getByText("Task", { exact: true }).first().locator(".."),
      log: (p) => p.getByRole("button", { name: "Log time" }),
      team: (p) => p.getByRole("link", { name: /Team timesheet/ }),
    },
  },
  {
    id: "timesheet-submit", path: "/timesheet?range=week",
    before: async (p) => {
      const b = p.getByRole("button", { name: /Submit/ }).first();
      if (await b.count()) await b.scrollIntoViewIfNeeded();
      await p.evaluate(() => window.scrollBy(0, 200));
    },
    spots: {
      submit: (p) => p.getByRole("button", { name: /Submit/ }).first(),
      entries: (p) => p.locator("table").first(),
    },
  },
  {
    id: "timesheet-team", path: "/timesheet/team",
    spots: {
      pending: (p) => p.getByText("Pending approvals").first().locator("xpath=ancestor::div[contains(@class,'card')][1]"),
      approveall: (p) => p.getByRole("button", { name: /Approve all/ }),
      approve: (p) => p.getByRole("button", { name: /^✓? ?Approve$/ }).first(),
      export: (p) => p.getByRole("link", { name: /Export all/ }),
    },
  },
  {
    id: "timesheet-person", path: "/timesheet/team?user=3",
    before: async (p) => {
      await p.getByText("Change history").first().scrollIntoViewIfNeeded().catch(() => {});
      await p.getByText("By project").first().scrollIntoViewIfNeeded();
      await p.evaluate(() => window.scrollBy(0, 150));
    },
    spots: {
      byproject: (p) => p.getByText("By project").first().locator(".."),
      history: (p) => p.getByText("Change history").first().locator(".."),
    },
  },
  {
    id: "projects", path: "/projects",
    spots: {
      newproject: (p) => p.getByRole("link", { name: "+ New Project" }).or(p.getByRole("button", { name: "+ New Project" })).first(),
      card: (p) => p.getByText("Festive Season Launch").first().locator("xpath=ancestor::a[1]"),
    },
  },
  {
    id: "project-detail", path: "/projects/1",
    spots: {
      progress: (p) => p.getByText(/tasks done/).first().locator(".."),
      addtask: (p) => p.getByRole("link", { name: "+ Add task" }).or(p.getByRole("button", { name: "+ Add task" })).first(),
      template: (p) => p.getByRole("button", { name: "Save as template" }).or(p.getByRole("link", { name: "Save as template" })).first(),
      tasks: (p) => p.getByText("Customer FAQ translation pass").first().locator("xpath=ancestor::div[contains(@class,'card')][1]"),
    },
  },
  {
    id: "calendar", path: "/calendar?scope=all",
    spots: {
      scope: (p) => p.getByRole("link", { name: "Everyone" }).first().locator(".."),
      month: (p) => p.getByText("September 2026").first().locator(".."),
      filters: (p) => p.getByRole("button", { name: "Apply" }).first().locator("xpath=ancestor::form[1]"),
      chip: (p) => p.getByText(/Reconcile October/).first(),
    },
  },
  {
    id: "recurring", path: "/recurring",
    spots: {
      people: (p) => p.getByText("Person:").first().locator(".."),
      stats: (p) => p.getByText("recurring jobs").first().locator(".."),
      grid: (p) => p.locator("table").first(),
    },
  },
  {
    id: "messages", path: "/messages/4",
    before: async (p) => p.waitForTimeout(1200),
    spots: {
      list: (p) => p.getByText("Chats").first().locator("xpath=ancestor::aside[1] | ancestor::div[contains(@class,'border-r')][1]").first(),
      translated: (p) => p.getByText("all invoices are matched").first(),
      composer: (p) => p.locator("textarea").last(),
      newchat: (p) => p.getByLabel("Start a new conversation").first(),
    },
  },
  {
    id: "discussion", path: "/discussion/1",
    before: async (p) => p.waitForTimeout(1200),
    spots: {
      groups: (p) => p.getByText("Accounts KSA").first().locator("xpath=ancestor::a[1]"),
      newgroup: (p) => p.getByTitle("Create a new group").first(),
      thread: (p) => p.getByText("Photography on track").first(),
      composer: (p) => p.locator("textarea").last(),
    },
  },
  {
    id: "notes", path: "/notes",
    spots: {
      take: (p) => p.getByText("Take a note…").first(),
      pinned: (p) => p.getByText("Festive launch checklist").first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]"),
      other: (p) => p.getByText("Vendor call notes").first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]"),
    },
  },
  {
    id: "documents", path: "/documents",
    spots: {
      attach: (p) => p.getByText("📎 Attach file").first(),
      link: (p) => p.getByText("🔗 Add link").first(),
      table: (p) => p.locator("table").first(),
    },
  },
  {
    id: "workload", path: "/workload",
    spots: {
      filters: (p) => p.getByRole("button", { name: "Apply" }).first().locator("xpath=ancestor::form[1]"),
      week: (p) => p.getByText(/This week ·/).first().locator(".."),
      grid: (p) => p.locator("table").first(),
    },
  },
  {
    id: "reports", path: "/reports",
    spots: {
      exports: (p) => p.getByRole("link", { name: /Export tasks/ }).locator(".."),
      filters: (p) => p.getByRole("button", { name: "Apply" }).first().locator("xpath=ancestor::form[1]"),
      stats: (p) => p.getByText("Total tasks").first().locator("xpath=../.."),
    },
  },
  {
    id: "inbox", path: "/notifications",
    spots: {
      markall: (p) => p.getByRole("button", { name: "Mark all read" }),
      item: (p) => p.getByText(/moved "Reconcile/).first().locator("xpath=ancestor::li[1] | ancestor::div[contains(@class,'card')][1]").first(),
      tabs: (p) => p.getByRole("link", { name: /Unread \(/ }).first().locator(".."),
    },
  },
  {
    id: "palette", path: "/dashboard",
    before: async (p) => {
      await p.keyboard.press("Control+k");
      await p.waitForTimeout(300);
      await p.keyboard.type("festive");
      await p.waitForTimeout(1200);
    },
    spots: {
      input: (p) => p.getByPlaceholder(/Search tasks, projects/),
      results: (p) => p.getByPlaceholder(/Search tasks, projects/).locator("xpath=ancestor::div[contains(@class,'rounded')][1]"),
    },
  },
  {
    id: "settings", path: "/settings",
    spots: {
      avatar: (p) => p.getByText("Profile picture").first().locator(".."),
      language: (p) => p.getByText("Preferred chat language").first().locator(".."),
    },
  },
  {
    id: "users", path: "/users",
    spots: {
      add: (p) => p.getByText("+ Add User").first(),
      bulk: (p) => p.getByText("Bulk import").first(),
      table: (p) => p.locator("table").first(),
    },
  },
  {
    id: "help-menu", path: "/tasks/3",
    before: async (p) => {
      await p.evaluate(() => {
        const nav = document.querySelector("aside nav");
        if (nav) nav.scrollTop = nav.scrollHeight;
      });
      await p.getByLabel("Help and how-to guide").click();
      await p.waitForTimeout(300);
    },
    spots: {
      button: (p) => p.getByLabel("Help and how-to guide"),
      thispage: (p) => p.getByText("Help for this page").locator(".."),
      related: (p) => p.getByText("Related", { exact: true }).locator(".."),
      full: (p) => p.getByRole("menuitem", { name: /Open the full guide/ }),
      sidebar: (p) => p.getByRole("link", { name: /Help & guide/ }).first(),
    },
  },
  {
    id: "ai-task", path: "/tasks",
    before: async (p) => {
      await p.getByText("New task with AI").first().click();
      await p.locator("textarea").first().fill(
        "Hi team — Riyadh warehouse says 120 units of the Eid gift box are damaged. Can someone raise a claim with BlueLine Logistics by Monday? Urgent. — Sara"
      );
    },
    spots: {
      box: (p) => p.locator("textarea").first(),
      draft: (p) => p.getByRole("button", { name: "Draft with AI" }),
      close: (p) => p.getByText("Create a task with AI").locator("xpath=../..").getByRole("button", { name: "Close" }),
    },
  },
  {
    id: "import-tasks", path: "/tasks?import=1",
    spots: {
      columns: (p) => p.getByText("Bulk import tasks from Excel").locator(".."),
      template: (p) => p.getByRole("link", { name: /Blank template/ }),
      file: (p) => p.locator("input[type=file]").first(),
      preview: (p) => p.getByRole("button", { name: "Preview" }),
    },
  },
  {
    id: "subtasks", path: "/tasks/1",
    before: async (p) => {
      await p.getByText("Dependencies", { exact: true }).first().scrollIntoViewIfNeeded();
      await p.evaluate(() => {
        const el = [...document.querySelectorAll("h2")].find((h) => h.textContent?.trim() === "Dependencies");
        el?.scrollIntoView({ block: "start" });
        document.querySelector("main")?.scrollBy(0, -90);
      });
      await p.waitForTimeout(300);
    },
    spots: {
      blocker: (p) => p.getByText("Book studio & lightbox").first().locator("xpath=ancestor::*[self::li or self::div][1]"),
      addblocker: (p) => p.getByRole("button", { name: "Add blocker" }),
      progress: (p) => p.getByText("Subtasks", { exact: false }).locator("xpath=ancestor::div[contains(@class,'card')][1]").locator(".bg-green-500").first(),
      subtask: (p) => p.getByText("Lifestyle shots").first(),
    },
  },
  {
    id: "task-tags", path: "/tasks/1",
    spots: {
      tags: (p) => p.getByText(/^photography/).first().locator(".."),
      addtag: (p) => p.getByText("+ tag").first(),
      blocked: (p) => p.getByText("⛔ Blocked").first(),
      done: (p) => p.getByText("Status", { exact: true }).first().locator("..").getByText(/Done/).first(),
    },
  },
  {
    id: "review-approve", path: "/tasks/3",
    spots: {
      inreview: (p) => p.getByText(/In Review/).filter({ hasText: "now" }).first(),
      approve: (p) => p.getByRole("button", { name: "Approve" }).first(),
      todo: (p) => p.getByRole("button", { name: "To Do" }).first(),
    },
  },
  {
    id: "backdate", path: "/tasks/14",
    before: async (p) => {
      await p.getByRole("button", { name: /Started earlier/ }).click();
      await p.locator("select[name=minutesAgo]").selectOption("30");
      await p.getByText("Time tracking").first().scrollIntoViewIfNeeded();
      await p.evaluate(() => document.querySelector("main")?.scrollBy(0, 200));
    },
    spots: {
      toggle: (p) => p.getByRole("button", { name: /Started earlier/ }),
      minutes: (p) => p.locator("select[name=minutesAgo]"),
      startthen: (p) => p.getByRole("button", { name: /Start from then/ }),
      start: (p) => p.getByRole("button", { name: /Start timer/ }),
    },
  },
  {
    id: "templates", path: "/templates",
    spots: {
      create: (p) => p.getByRole("button", { name: "Create template" }).locator("xpath=ancestor::form[1]"),
      row: (p) => p.getByText("New marketplace launch").first().locator("xpath=ancestor::div[contains(@class,'card')][1]"),
      edit: (p) => p.getByText("Edit tasks").first(),
    },
  },
  {
    id: "people-profile", path: "/people/3",
    spots: {
      message: (p) => p.getByRole("link", { name: "Message", exact: true }).or(p.getByRole("button", { name: "Message", exact: true })).first(),
      stats: (p) => p.getByText("Open tasks").first().locator("xpath=ancestor::div[contains(@class,'grid')][1]"),
      now: (p) => p.getByText(/is working on now/).first().locator("xpath=ancestor::div[contains(@class,'card')][1]"),
      manage: (p) => p.getByText("Manage account").first().locator("xpath=ancestor::details[1]"),
    },
  },
  {
    id: "search-results", path: "/search?q=festive",
    spots: {
      tasks: (p) => p.getByRole("heading", { name: "Tasks" }).locator(".."),
      docs: (p) => p.getByRole("heading", { name: "Documents" }).locator(".."),
      notes: (p) => p.getByRole("heading", { name: "Your notes" }).locator(".."),
    },
  },
  {
    id: "recycle-bin", path: "/trash",
    spots: {
      search: (p) => p.getByRole("button", { name: "Search" }).locator("xpath=ancestor::form[1]"),
      restore: (p) => p.getByRole("button", { name: "Restore" }).first(),
      forever: (p) => p.getByRole("button", { name: /Delete/ }).first(),
    },
  },
  {
    id: "departments", path: "/departments",
    spots: {
      add: (p) => p.locator("input[name=name]").first().locator("xpath=ancestor::form[1]"),
      list: (p) => p.locator("table").first().or(p.getByText("Marketing").first().locator("xpath=ancestor::div[contains(@class,'card')][1]")).first(),
    },
  },
  {
    id: "billing", path: "/billing",
    spots: {
      month: (p) => p.getByText(/This month/).first().locator("xpath=ancestor::div[contains(@class,'card')][1]"),
      rate: (p) => p.getByRole("heading", { name: "Rate" }).locator("xpath=ancestor::div[contains(@class,'card')][1]"),
      snapshot: (p) => p.getByRole("button", { name: /Generate this month/ }),
      pdf: (p) => p.getByRole("button", { name: /Print/ }).or(p.getByRole("link", { name: /Print/ })).first(),
    },
  },
  {
    id: "notification-settings", path: "/settings",
    before: async (p) => {
      await p.getByRole("heading", { name: "Notifications" }).scrollIntoViewIfNeeded();
      await p.evaluate(() => document.querySelector("main")?.scrollBy(0, 250));
    },
    spots: {
      email: (p) => p.getByText("Email notifications", { exact: true }).locator("xpath=../.."),
      save: (p) => p.getByRole("button", { name: "Save preferences" }),
      password: (p) => p.getByRole("heading", { name: /password/i }).first().locator("xpath=ancestor::div[contains(@class,'card')][1]"),
    },
  },
  {
    id: "reports-estimates", path: "/reports",
    before: async (p) => {
      await p.getByRole("heading", { name: "Estimates vs actual" }).scrollIntoViewIfNeeded();
      await p.evaluate(() => {
        const h = [...document.querySelectorAll("h2")].find((x) => x.textContent === "Estimates vs actual");
        h?.scrollIntoView({ block: "start" });
        document.querySelector("main")?.scrollBy(0, -40);
      });
    },
    spots: {
      totals: (p) => p.getByText("Tasks compared").locator("xpath=../.."),
      bands: (p) => p.getByText(/^On target:/).locator(".."),
      people: (p) => p.getByRole("heading", { name: "Estimates vs actual" }).locator("xpath=ancestor::div[contains(@class,'card')][1]").locator("table"),
      over: (p) => p.getByText("Open tasks already over their estimate").locator(".."),
    },
  },
  {
    id: "welcome", path: "/dashboard", as: "karan",
    before: async (p) => p.waitForTimeout(1200),
    spots: {
      checklist: (p) => p.getByLabel("Getting started"),
      step: (p) => p.getByRole("link", { name: /Add a profile photo/ }),
      showme: (p) => p.getByRole("link", { name: "Show me how" }).first(),
      guide: (p) => p.getByRole("link", { name: /5-minute guide/ }),
      dismiss: (p) => p.getByRole("button", { name: "Dismiss" }),
      prompt: (p) => p.getByRole("alertdialog"),
      keep: (p) => p.getByRole("button", { name: "Yes, keep going" }),
      stopnow: (p) => p.getByRole("alertdialog").getByRole("button", { name: /Stop/ }),
      pill: (p) => p.locator("header a[href^='/tasks/']").first(),
    },
  },
  {
    id: "timer-running", path: "/tasks/6",
    before: async (p) => {
      const start = p.getByRole("button", { name: /Start timer|Switch timer/ });
      if (await start.count()) {
        await start.first().click();
        await p.waitForLoadState("networkidle");
      }
      await p.getByText("Time tracking").first().scrollIntoViewIfNeeded();
      await p.waitForTimeout(2500);
    },
    spots: {
      pill: (p) => p.locator("header").getByText("Approve influencer shortlist").first().locator("xpath=ancestor::*[self::a or self::div][1]"),
      stop: (p) => p.getByRole("button", { name: /Stop & log/ }),
      discard: (p) => p.getByRole("button", { name: "Discard" }),
      clock: (p) => p.getByText("recording").first().locator(".."),
    },
  },
  {
    id: "mobile", path: "/my-tasks", mobile: true,
    spots: {
      menu: (p) => p.locator("button:visible").first(),
      circle: (p) => p.getByRole("button", { name: "✓" }).first(),
      newtask: (p) => p.getByRole("link", { name: "+ New Task" }).first(),
    },
  },
];

async function box(page, loc, clipY) {
  try {
    const b = await loc.first().boundingBox({ timeout: 3000 });
    if (!b || b.width === 0) return null;
    return b ? { x: b.x, y: b.y - clipY, w: b.width, h: b.height } : null;
  } catch {
    return null;
  }
}

(async () => {
  fs.mkdirSync(OUT_IMG, { recursive: true });
  const existing = fs.existsSync(OUT_JSON) ? JSON.parse(fs.readFileSync(OUT_JSON, "utf8")) : {};
  const browser = await chromium.launch();
  const anon = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const karan = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });

  for (const [c, email] of [[ctx, "priya@demo.local"], [phone, "priya@demo.local"], [karan, "karan@demo.local"]]) {
    const p = await c.newPage();
    await p.goto(`${BASE}/login`);
    await p.fill("input[name=email]", email);
    await p.fill("input[name=password]", "Demo@12345");
    await Promise.all([p.waitForURL(/dashboard/), p.click("button[type=submit]")]);
    await p.close();
  }

  for (const shot of SHOTS) {
    if (ONLY && !ONLY.includes(shot.id)) continue;
    const c = shot.auth === false ? anon : shot.mobile ? phone : shot.as === "karan" ? karan : ctx;
    const p = await c.newPage();
    await p.goto(BASE + shot.path, { waitUntil: "networkidle" });
    await p.addStyleTag({ content: "*{caret-color:transparent!important} nextjs-portal{display:none!important}" });
    if (shot.before) await shot.before(p);
    await p.waitForTimeout(400);
    const vw = p.viewportSize().width;
    const vh = p.viewportSize().height;
    const boxes = {};
    for (const [key, fn] of Object.entries(shot.spots)) {
      const b = await box(p, fn(p), 0);
      if (!b) {
        console.warn(`  ! ${shot.id}.${key} not found`);
        continue;
      }
      const clamp = (v) => Math.max(0, Math.min(100, v));
      const x1 = clamp((b.x / vw) * 100), y1 = clamp((b.y / vh) * 100);
      const x2 = clamp(((b.x + b.w) / vw) * 100), y2 = clamp(((b.y + b.h) / vh) * 100);
      if (y2 <= 0 || y1 >= 100) {
        console.warn(`  ! ${shot.id}.${key} off-screen`);
        continue;
      }
      boxes[key] = { x: +x1.toFixed(2), y: +y1.toFixed(2), w: +(x2 - x1).toFixed(2), h: +(y2 - y1).toFixed(2) };
    }
    await p.screenshot({ path: path.join(OUT_IMG, `${shot.id}.jpg`), type: "jpeg", quality: 82 });
    existing[shot.id] = { w: vw, h: vh, boxes };
    console.log(`✓ ${shot.id} (${Object.keys(boxes).length}/${Object.keys(shot.spots).length} spots)`);
    await p.close();
  }

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(existing, null, 2) + "\n");
  await browser.close();
})();
