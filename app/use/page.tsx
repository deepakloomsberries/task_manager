import type { Metadata } from "next";
import Link from "next/link";
import AnnotatedShot, { type ShotData } from "./AnnotatedShot";
import GuideSearch from "./GuideSearch";
import { CopyLink, MarkDone, PathProgress, PrintGuide, StepTick } from "./Progress";
import { CATEGORIES, FAQS, GLOSSARY, QUICK_STARTS, WHATS_NEW, type Article, type Audience } from "./content";
import { appPathFor } from "@/lib/guideLinks";
import shots from "./shots.json";

const TITLE = "How to use Looms & Berries Tasks — Guide";
const DESCRIPTION =
  "Step-by-step guide with annotated screenshots: tasks, timers, timesheets, projects, chat, notes, workload, reports and admin.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/use" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/use",
    siteName: "Looms & Berries Tasks",
    type: "website",
    images: [{ url: "/guide/dashboard.jpg", width: 2880, height: 1800, alt: "Dashboard" }],
  },
};

const SHOTS = shots as Record<string, ShotData>;

const GUIDE_CSS = `
        [data-toc] a[aria-current="true"]{color:rgb(2 132 199);font-weight:600;border-color:rgb(2 132 199)}
        .guide-article:target{animation:guide-flash 2.4s ease-out}
        @keyframes guide-flash{0%,30%{background:rgb(224 242 254 / .9);box-shadow:0 0 0 12px rgb(224 242 254 / .9)}100%{background:transparent;box-shadow:0 0 0 12px transparent}}
        .dark .guide-article:target{animation-name:guide-flash-dark}
        @keyframes guide-flash-dark{0%,30%{background:rgb(12 74 110 / .45);box-shadow:0 0 0 12px rgb(12 74 110 / .45)}100%{background:transparent;box-shadow:0 0 0 12px transparent}}
        @media print{[data-article][hidden],[data-category][hidden]{display:block!important}.guide-article{break-inside:auto}}
      `;

const AUDIENCE_STYLE: Record<Audience, string> = {
  Everyone: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900",
  Managers: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  Admins: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900",
};

const EXTRAS = [
  { id: "whats-new", title: "✨ What's new" },
  { id: "shortcuts", title: "⌨️ Shortcuts" },
  { id: "glossary", title: "📖 Glossary" },
  { id: "faq", title: "❓ Troubleshooting & FAQ" },
];

const SHORTCUTS: [string, string][] = [
  ["Ctrl / ⌘ + K", "Search anything, or create a task"],
  ["?", "Help for the page you're on"],
  ["Ctrl / ⌘ + V", "Paste a screenshot into a task, comment or chat"],
  ["@name", "Mention someone in a comment"],
  ["Esc", "Close a dialog, menu or the search box"],
  ["/", "Search this guide"],
  ["← →", "Previous / next step in “Step by step” mode"],
];

function searchText(a: Article, category: string) {
  return [a.title, a.summary, category, a.audience, ...(a.callouts ?? []).flatMap((c) => [c.title, c.body]), ...(a.tips ?? [])]
    .join(" ")
    .toLowerCase();
}

function ArticleBlock({ a, category }: { a: Article; category: string }) {
  const shot = a.shot ? SHOTS[a.shot] : undefined;
  const appPath = appPathFor(a.id);
  return (
    <article
      id={a.id}
      data-article
      data-audience={a.audience}
      data-search={searchText(a, category)}
      className="guide-article scroll-mt-24 rounded-2xl py-10 first:pt-2 print:py-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xl font-bold tracking-tight sm:text-2xl">
          <a href={`#${a.id}`} className="group">
            {a.title}
            <span className="ml-2 text-slate-300 opacity-0 transition group-hover:opacity-100 dark:text-slate-600">#</span>
          </a>
        </h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${AUDIENCE_STYLE[a.audience]}`}>
          {a.audience}
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-slate-600 dark:text-slate-300">{a.summary}</p>

      {shot && a.shot && a.callouts && (
        <div className="mt-5">
          <AnnotatedShot
            id={a.id}
            src={`/guide/${a.shot}.jpg`}
            alt={`${a.title} — annotated screenshot`}
            shot={shot}
            callouts={a.callouts}
            phone={shot.w < 600}
          />
        </div>
      )}

      {a.tips && a.tips.length > 0 && (
        <div className="mt-4 space-y-2">
          {a.tips.map((t) => (
            <p
              key={t}
              className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 break-inside-avoid dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
            >
              <span aria-hidden>💡</span>
              <span>{t}</span>
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 print:hidden">
        <MarkDone id={a.id} />
        {appPath && (
          <Link href={appPath} className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-400">
            Try it in the app →
          </Link>
        )}
        <span className="flex-1" />
        <CopyLink id={a.id} />
      </div>
    </article>
  );
}

export default function GuidePage() {
  const articleCount = CATEGORIES.reduce((n, c) => n + c.articles.length, 0);
  const titleOf = new Map(CATEGORIES.flatMap((c) => c.articles.map((a) => [a.id, a.title] as const)));

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* dangerouslySetInnerHTML: a text child would be HTML-escaped on the server and fail hydration. */}
      <style dangerouslySetInnerHTML={{ __html: GUIDE_CSS }} />

      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <Link href="/about" className="whitespace-nowrap text-base font-bold sm:text-lg">
            Looms <span className="text-sky-600">&amp;</span> Berries
            <span className="ml-1.5 font-normal text-slate-400">Guide</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium sm:gap-2">
            <Link href="/about" className="hidden rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 sm:block">
              About
            </Link>
            <a href="#faq" className="hidden rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 sm:block">
              FAQ
            </a>
            <PrintGuide />
            <Link href="/dashboard" className="btn-primary whitespace-nowrap">
              <span className="sm:hidden">Open app</span>
              <span className="hidden sm:inline">Open the app →</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-sky-50 to-white print:border-0 print:bg-none dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <div className="mx-auto max-w-3xl px-5 py-14 text-center sm:py-20 print:py-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-sky-700 shadow-sm ring-1 ring-sky-100 print:hidden dark:bg-slate-900 dark:text-sky-300 dark:ring-slate-700">
            📘 Knowledge base · {articleCount} guides
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">How to use Looms &amp; Berries Tasks</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-300">
            Real screenshots with numbered arrows showing exactly where to click. Press{" "}
            <b className="whitespace-nowrap">▶ Step by step</b> on any picture to be walked through it.
          </p>
          <div className="mx-auto mt-8 max-w-xl print:hidden">
            <GuideSearch />
          </div>
        </div>
      </section>

      {/* Quick starts */}
      <section id="start-here" data-hide-when-searching className="mx-auto max-w-7xl scroll-mt-20 px-5 py-12 print:hidden sm:px-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Start here</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {QUICK_STARTS.map((qs) => (
            <div key={qs.title} className="card p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  <span className="mr-2">{qs.icon}</span>
                  {qs.title}
                </h3>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${AUDIENCE_STYLE[qs.audience]}`}>
                  {qs.audience}
                </span>
              </div>
              <ol className="mt-4 space-y-1.5">
                {qs.steps.map((s, i) => (
                  <li key={s.href}>
                    <a href={s.href} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 group-hover:bg-sky-600 group-hover:text-white dark:bg-slate-800 dark:text-slate-300">
                        {i + 1}
                      </span>
                      <span className="text-slate-700 group-hover:text-sky-700 dark:text-slate-200 dark:group-hover:text-sky-300">{s.label}</span>
                      <StepTick id={s.href.slice(1)} />
                    </a>
                  </li>
                ))}
              </ol>
              <PathProgress ids={qs.steps.map((s) => s.href.slice(1))} />
            </div>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CATEGORIES.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="rounded-xl border border-slate-200 p-4 transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md dark:border-slate-700 dark:hover:border-sky-700"
            >
              <div className="text-2xl">{c.icon}</div>
              <div className="mt-2 font-semibold">{c.title}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{c.blurb}</div>
              <div className="mt-2 text-[11px] text-slate-400">{c.articles.length} guides</div>
            </a>
          ))}
        </div>
      </section>

      {/* Phones / tablets: compact "jump to" menu in place of the sidebar */}
      <div className="sticky top-[57px] z-20 border-y border-slate-200 bg-white/95 px-5 py-2 backdrop-blur print:hidden dark:border-slate-800 dark:bg-slate-950/95 lg:hidden">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span>📑 Jump to a guide…</span>
            <span className="text-slate-400 transition group-open:rotate-180">▾</span>
          </summary>
          <nav aria-label="Guide contents" className="mt-2 max-h-[60vh] overflow-y-auto pb-2 text-sm">
            {CATEGORIES.map((c) => (
              <div key={c.id} className="mb-3">
                <a href={`#${c.id}`} className="font-semibold">
                  {c.icon} {c.title}
                </a>
                <ul className="mt-1 grid grid-cols-1 gap-0.5 pl-6 sm:grid-cols-2">
                  {c.articles.map((a) => (
                    <li key={a.id}>
                      <a href={`#${a.id}`} className="block py-1 text-slate-600 dark:text-slate-300">
                        {a.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-2 dark:border-slate-800">
              {EXTRAS.map((x) => (
                <a key={x.id} href={`#${x.id}`} className="py-1 text-slate-600 dark:text-slate-300">
                  {x.title}
                </a>
              ))}
            </div>
          </nav>
        </details>
      </div>

      {/* Body: TOC + articles */}
      <div className="mx-auto max-w-7xl px-5 pb-16 sm:px-6 lg:grid lg:grid-cols-[230px_1fr] lg:gap-10">
        <aside className="hidden lg:block print:hidden">
          <nav aria-label="Guide contents" className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-6 pr-2 text-sm">
            {CATEGORIES.map((c) => (
              <div key={c.id} data-toc-category className="mb-5">
                <a href={`#${c.id}`} className="font-semibold text-slate-900 hover:text-sky-700 dark:text-slate-100">
                  {c.icon} {c.title}
                </a>
                <ul className="mt-2 space-y-1 border-l border-slate-200 dark:border-slate-700">
                  {c.articles.map((a) => (
                    <li key={a.id} data-toc={a.id}>
                      <a
                        href={`#${a.id}`}
                        className="-ml-px block border-l border-transparent py-0.5 pl-3 text-slate-600 hover:border-slate-400 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      >
                        {a.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div data-hide-when-searching className="space-y-1 border-t border-slate-200 pt-4 dark:border-slate-700">
              {EXTRAS.map((x) => (
                <a key={x.id} href={`#${x.id}`} className="block py-0.5 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                  {x.title}
                </a>
              ))}
            </div>
          </nav>
        </aside>

        <main id="main-content" className="min-w-0">
          <div id="no-results" hidden className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
            <div className="text-3xl">🔍</div>
            <p className="mt-2 font-semibold">No guides match that.</p>
            <p className="mt-1 text-sm text-slate-500">
              Try a different word — or ask in the app: message your manager or an admin.
            </p>
          </div>

          {CATEGORIES.map((c) => (
            <section key={c.id} id={c.id} data-category className="scroll-mt-20 border-t border-slate-200 pt-10 first:border-t-0 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{c.icon}</span>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{c.title}</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{c.blurb}</p>
                </div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {c.articles.map((a) => (
                  <ArticleBlock key={a.id} a={a} category={c.title} />
                ))}
              </div>
            </section>
          ))}

          {/* What's new */}
          <section id="whats-new" data-hide-when-searching className="scroll-mt-20 border-t border-slate-200 pt-12 dark:border-slate-800">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">✨ What&apos;s new</h2>
            <ol className="mt-6 space-y-4 border-l-2 border-sky-100 pl-6 dark:border-sky-900">
              {WHATS_NEW.map((w) => (
                <li key={w.title} className="relative break-inside-avoid">
                  <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-sky-500 dark:border-slate-950" />
                  <div className="text-xs font-medium text-slate-400">{w.date}</div>
                  <div className="font-semibold">{w.title}</div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {w.body}{" "}
                    {w.link && (
                      <a href={`#${w.link}`} className="whitespace-nowrap text-sky-700 hover:underline dark:text-sky-400">
                        {titleOf.get(w.link) ? "How it works →" : ""}
                      </a>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {/* Keyboard shortcuts */}
          <section
            id="shortcuts"
            data-hide-when-searching
            className="mt-14 scroll-mt-20 rounded-2xl border border-slate-200 bg-slate-50 p-6 break-inside-avoid dark:border-slate-800 dark:bg-slate-900/40"
          >
            <h2 className="text-lg font-bold">⌨️ Handy shortcuts</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              {SHORTCUTS.map(([k, v]) => (
                <div key={k} className="flex items-center gap-3">
                  <dt>
                    <kbd className="rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs shadow-sm dark:border-slate-600 dark:bg-slate-800">{k}</kbd>
                  </dt>
                  <dd className="text-slate-600 dark:text-slate-300">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Glossary */}
          <section id="glossary" data-hide-when-searching className="scroll-mt-20 pt-14">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">📖 Glossary</h2>
            <p className="mt-1 text-sm text-slate-500">Words you&apos;ll see around the app.</p>
            <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {GLOSSARY.map((g) => (
                <div key={g.term} className="break-inside-avoid border-b border-slate-100 pb-3 dark:border-slate-800">
                  <dt className="font-semibold">{g.term}</dt>
                  <dd className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{g.meaning}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* FAQ */}
          <section id="faq" data-hide-when-searching className="scroll-mt-20 pt-14">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">❓ Troubleshooting &amp; FAQ</h2>
            <div className="mt-6 space-y-3">
              {FAQS.map((f) => (
                <details key={f.q} className="group card px-5 py-4 open:shadow-md">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-45">＋</span>
                  </summary>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="mt-14 rounded-2xl bg-gradient-to-br from-slate-900 to-sky-900 p-8 text-center text-white print:hidden">
            <h2 className="text-2xl font-bold">Still stuck?</h2>
            <p className="mx-auto mt-2 max-w-md text-sky-50/90">
              Message your manager or an admin from inside the app — or email us and we&apos;ll help.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link href="/dashboard" className="rounded-lg bg-white px-5 py-2.5 font-semibold text-sky-800 hover:bg-sky-50">
                Open the app
              </Link>
              <a href="mailto:sales@loomsberries.com?subject=Help%20with%20Looms%20%26%20Berries%20Tasks" className="rounded-lg border border-white/40 px-5 py-2.5 font-semibold hover:bg-white/10">
                Email support
              </a>
            </div>
          </section>
        </main>
      </div>

      <footer className="border-t border-slate-200 py-8 print:hidden dark:border-slate-800">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 text-sm text-slate-500 dark:text-slate-400 sm:px-6">
          <span>© {new Date().getFullYear()} Looms &amp; Berries Tasks · Screenshots use fictional demo data.</span>
          <div className="flex gap-4">
            <Link href="/about" className="hover:text-slate-700 dark:hover:text-slate-200">About</Link>
            <Link href="/login" className="hover:text-slate-700 dark:hover:text-slate-200">Sign in →</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
