import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Looms & Berries Tasks — Work management for real teams",
  description:
    "Tasks, projects, time tracking, team chat and AI in one place. Built and battle-tested by a team running daily operations across India, the UAE and Saudi Arabia.",
};

const CONTACT_EMAIL = "sales@loomsberries.com";
const CONTACT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "Interested in Looms & Berries Tasks"
)}`;

type Feature = {
  icon: string;
  title: string;
  body: string;
};

type FeatureGroup = {
  title: string;
  items: Feature[];
};

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: "Plan the work",
    items: [
      {
        icon: "✨",
        title: "AI-drafted tasks",
        body: "Paste an email, a chat message or a screenshot and let AI turn it into a ready-to-edit task — title, priority and due date pre-filled, nothing created until you approve it.",
      },
      {
        icon: "🗓️",
        title: "Calendar & scheduling",
        body: "Every due date, meeting and project milestone on one calendar — filterable by project, person or department.",
      },
      {
        icon: "🗄️",
        title: "Documents & files",
        body: "A shared file library attached to every project and task, so specs, contracts and assets live next to the work instead of scattered across email and drives.",
      },
      {
        icon: "📝",
        title: "Notes",
        body: "Quick notes and running docs on a project or kept personal — for meeting minutes, decisions and anything that doesn't need to be a task.",
      },
    ],
  },
  {
    title: "Track time & workload",
    items: [
      {
        icon: "⏱️",
        title: "Built-in time tracking",
        body: "One-click task timers, weekly timesheets with an approval workflow, and live \"who's working on what right now\" visibility for managers.",
      },
      {
        icon: "⚖️",
        title: "Workload & capacity",
        body: "See who's overloaded and who has room before you assign the next task — a live view of everyone's open work across all projects.",
      },
    ],
  },
  {
    title: "Communicate",
    items: [
      {
        icon: "🌐",
        title: "AI-translated conversations",
        body: "Teammates each set their own preferred language. Messages translate automatically as they arrive, with a one-tap \"Show original\" whenever you need the exact wording.",
      },
      {
        icon: "🎥",
        title: "Video calls",
        body: "Jump from a chat straight into a video call — no separate meeting link or third-party app required.",
      },
      {
        icon: "📢",
        title: "Company-wide discussion",
        body: "A dedicated space for announcements and cross-team discussion, kept separate from day-to-day project chat.",
      },
      {
        icon: "🔔",
        title: "Notifications that don't nag",
        body: "Daily due/overdue digests, a weekly team time summary, and unread-message emails that only fire once someone's genuinely missed a message — never a duplicate.",
      },
    ],
  },
  {
    title: "See what's happening",
    items: [
      {
        icon: "📊",
        title: "Dashboards that answer real questions",
        body: "A personal dashboard for \"what's on me today,\" and a command-centre view for managers: overdue work, who's over capacity, project health and team activity.",
      },
      {
        icon: "📑",
        title: "Reports",
        body: "Exportable reports on tasks, time and project progress — for management reviews, client updates or billing.",
      },
      {
        icon: "🔎",
        title: "Global search",
        body: "Find any task, message, document or person in seconds, from one search bar.",
      },
    ],
  },
  {
    title: "Run it your way",
    items: [
      {
        icon: "🌍",
        title: "Multi-office & departments",
        body: "Multiple companies, departments and offices in one workspace, with live local time shown for every office so a distributed team never has to guess who's around.",
      },
      {
        icon: "🧑‍🤝‍🧑",
        title: "People directory",
        body: "A full employee directory with roles, departments and offices — the single source of truth for who's who.",
      },
      {
        icon: "🔐",
        title: "Role-based access & admin controls",
        body: "Admin, manager and employee roles, CSV import/export, and a recycle bin for anything deleted by mistake.",
      },
      {
        icon: "💳",
        title: "Billing & per-seat reports",
        body: "Per-seat usage and cost-recovery reports for finance and internal billing, without spreadsheets.",
      },
    ],
  },
];

const WHY = [
  {
    icon: "🏗️",
    title: "Actually used, every day",
    body: "Not a demo product — it runs real operations across three countries, every working day.",
  },
  {
    icon: "🤖",
    title: "AI included, not upsold",
    body: "Translation and AI task drafting are part of the product, not a separate paid add-on.",
  },
  {
    icon: "⚡",
    title: "No bloat",
    body: "Everything a growing team needs — nothing you have to configure away before it's useful.",
  },
  {
    icon: "🛠️",
    title: "Yours to shape",
    body: "Hosted on your own domain and server, so it grows around how your team actually works.",
  },
];

function Screenshot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-300/40 ring-1 ring-slate-900/5 dark:border-slate-700 dark:shadow-none">
      <Image src={src} alt={alt} width={1440} height={960} className="w-full" />
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-5 sm:py-4">
          <div className="whitespace-nowrap text-base font-bold sm:text-lg">
            Looms <span className="text-sky-600">&amp;</span> Berries
            <span className="ml-1.5 hidden font-normal text-slate-400 sm:inline">Tasks</span>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300 md:flex">
            <a href="#features" className="hover:text-slate-900 dark:hover:text-white">
              Features
            </a>
            <a href="#why" className="hover:text-slate-900 dark:hover:text-white">
              Why it&apos;s different
            </a>
            <a href="#contact" className="hover:text-slate-900 dark:hover:text-white">
              Contact
            </a>
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <details className="relative md:hidden">
              <summary
                aria-label="Open menu"
                className="flex cursor-pointer list-none items-center justify-center rounded-lg border border-slate-300 p-2 text-slate-600 [&::-webkit-details-marker]:hidden dark:border-slate-600 dark:text-slate-300"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </summary>
              <div className="absolute right-0 top-full z-40 mt-2 w-44 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <a href="#features" className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                  Features
                </a>
                <a href="#why" className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                  Why it&apos;s different
                </a>
                <a href="#contact" className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
                  Contact
                </a>
              </div>
            </details>
            <Link
              href="/login"
              className="btn-secondary whitespace-nowrap !px-2.5 !py-1.5 text-xs sm:!px-4 sm:text-sm"
            >
              Sign in
            </Link>
            <a
              href={CONTACT_HREF}
              className="btn-primary whitespace-nowrap !px-2.5 !py-1.5 text-xs sm:!px-4 sm:text-sm"
            >
              Request a demo
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[32rem] bg-[radial-gradient(60%_60%_at_50%_0%,theme(colors.sky.100),transparent)] dark:bg-[radial-gradient(60%_60%_at_50%_0%,theme(colors.sky.950),transparent)]"
        />
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-16 sm:pb-24 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900">
              Task &amp; team management
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
              One place to run tasks, time, chat and your whole team.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
              Looms &amp; Berries Tasks brings task management, project tracking, time sheets, team
              chat and AI into a single tool — built by a real operations team and used every day
              to run business across three countries.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a href={CONTACT_HREF} className="btn-primary px-6 py-3 text-base">
                Request a demo
              </a>
              <a href="#features" className="btn-secondary px-6 py-3 text-base">
                See what&apos;s inside ↓
              </a>
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-5xl">
            <Screenshot src="/marketing/dashboard.png" alt="Looms & Berries Tasks dashboard" />
          </div>
        </div>
      </section>

      {/* Proof strip */}
      <section className="border-y border-slate-200 bg-slate-50 py-6 dark:border-slate-800 dark:bg-slate-900/40">
        <p className="mx-auto max-w-3xl px-5 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
          Actively used every working day across offices in{" "}
          <span className="text-slate-700 dark:text-slate-200">India</span>,{" "}
          <span className="text-slate-700 dark:text-slate-200">the UAE</span> and{" "}
          <span className="text-slate-700 dark:text-slate-200">Saudi Arabia</span> — not a demo,
          a real production tool.
        </p>
      </section>

      {/* Feature showcase — a few larger, alternating sections for the standout features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything a growing team needs</h2>
          <p className="mt-3 text-slate-600 dark:text-slate-300">
            No juggling five different apps. Tasks, time, chat, dashboards and AI all live in one
            place, sharing the same people, projects and permissions.
          </p>
        </div>

        <div className="mt-16 space-y-24">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <span className="text-3xl">🗂️</span>
              <h3 className="mt-3 text-2xl font-semibold">Tasks that move at your team&apos;s pace</h3>
              <p className="mt-3 text-slate-600 dark:text-slate-300">
                Board or list view, whichever fits the moment. Priorities, due dates, subtasks that
                gate completion until they&apos;re all done, blockers and dependencies, tags, saved
                filters, and bulk actions for cleaning up dozens of tasks at once.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <li>• Drag-and-drop Kanban board with live status updates</li>
                <li>• Recurring tasks that regenerate automatically</li>
                <li>• CSV import/export for migrating or reporting</li>
              </ul>
            </div>
            <Screenshot src="/marketing/board.png" alt="Task board view" />
          </div>

          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="order-2 lg:order-1">
              <Screenshot src="/marketing/project.png" alt="Project detail with team summary" />
            </div>
            <div className="order-1 lg:order-2">
              <span className="text-3xl">📈</span>
              <h3 className="mt-3 text-2xl font-semibold">Projects with a real team summary</h3>
              <p className="mt-3 text-slate-600 dark:text-slate-300">
                Every project shows a live breakdown of each person&apos;s open, in-progress, in-review
                and done tasks — plus what they&apos;re actively working on right now, straight from
                the built-in timer. No separate status meeting required.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <li>• One-click &quot;start a project from a template,&quot; dates auto-calculated</li>
                <li>• Timeline view for the whole project&apos;s schedule</li>
                <li>• Click straight through from a status count into the filtered task list</li>
              </ul>
            </div>
          </div>

          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <span className="text-3xl">🌐</span>
              <h3 className="mt-3 text-2xl font-semibold">Chat that speaks everyone&apos;s language</h3>
              <p className="mt-3 text-slate-600 dark:text-slate-300">
                A teammate in India can write in English while a colleague in Riyadh reads it in
                Arabic — automatically, in real time. Everyone sets their own preferred language
                once, and every conversation adapts from then on, with the original always one tap
                away.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <li>• Supports English, Arabic, Hindi, Kannada, Tamil, Telugu, Malayalam, Marathi, Bengali, Urdu and French</li>
                <li>• Full chat features: attachments, replies, reactions, starring, video calls</li>
                <li>• &quot;Show original&quot; on any translated message, one hover away</li>
              </ul>
            </div>
            <Screenshot src="/marketing/chat-translate.png" alt="Auto-translated chat message with Show original" />
          </div>
        </div>
      </section>

      {/* Full feature grid — grouped so everything the product does is easy to scan */}
      <section className="bg-slate-50 py-20 dark:bg-slate-900/30">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Every module, in one workspace</h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300">
              Nothing here is a bolt-on. It&apos;s the same set of modules the team runs daily
              operations on.
            </p>
          </div>

          <div className="mt-14 space-y-14">
            {FEATURE_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
                  {group.title}
                </h3>
                <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {group.items.map((f) => (
                    <div key={f.title} className="card p-6">
                      <span className="text-2xl">{f.icon}</span>
                      <h4 className="mt-3 font-semibold">{f.title}</h4>
                      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{f.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why it's different */}
      <section id="why" className="mx-auto max-w-6xl scroll-mt-16 px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Why teams choose it over another SaaS tool</h2>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {WHY.map((w) => (
            <div key={w.title} className="text-center">
              <span className="text-3xl">{w.icon}</span>
              <h3 className="mt-3 font-semibold">{w.title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section id="contact" className="scroll-mt-16 border-t border-slate-200 bg-gradient-to-br from-slate-900 to-sky-900 dark:border-slate-800">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center text-white">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Want this running for your team?</h2>
          <p className="mx-auto mt-4 max-w-xl text-sky-50/90">
            Get in touch and we&apos;ll walk you through it — tasks, time tracking, chat with live
            translation and AI, set up on your own domain.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href={CONTACT_HREF}
              className="rounded-lg bg-white px-6 py-3 text-base font-semibold text-sky-800 shadow-sm hover:bg-sky-50"
            >
              Email {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 text-sm text-slate-500 dark:text-slate-400">
          <span>
            © {new Date().getFullYear()} Looms &amp; Berries Tasks
          </span>
          <Link href="/login" className="hover:text-slate-700 dark:hover:text-slate-200">
            Sign in →
          </Link>
        </div>
      </footer>
    </div>
  );
}
