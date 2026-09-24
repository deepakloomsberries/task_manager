import type { Metadata } from "next";
import Link from "next/link";
import AnnotatedShot, { type ShotData } from "./AnnotatedShot";
import GuideSearch from "./GuideSearch";
import { CATEGORIES, FAQS, QUICK_STARTS, type Article, type Audience } from "./content";
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

const AUDIENCE_STYLE: Record<Audience, string> = {
  Everyone: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900",
  Managers: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  Admins: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900",
};

function searchText(a: Article, category: string) {
  return [a.title, a.summary, category, a.audience, ...(a.callouts ?? []).flatMap((c) => [c.title, c.body]), ...(a.tips ?? [])]
    .join(" ")
    .toLowerCase();
}

function ArticleBlock({ a, category }: { a: Article; category: string }) {
  const shot = a.shot ? SHOTS[a.shot] : undefined;
  return (
    <article id={a.id} data-article data-search={searchText(a, category)} className="scroll-mt-24 py-10 first:pt-2">
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
              className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
            >
              <span aria-hidden>💡</span>
              <span>{t}</span>
            </p>
          ))}
        </div>
      )}
    </article>
  );
}

export default function GuidePage() {
  const articleCount = CATEGORIES.reduce((n, c) => n + c.articles.length, 0);

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <style>{`[data-toc] a[aria-current="true"]{color:rgb(2 132 199);font-weight:600;border-color:rgb(2 132 199)}`}</style>

      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
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
            <Link href="/login" className="btn-primary whitespace-nowrap">
              Open the app →
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-sky-50 to-white dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <div className="mx-auto max-w-3xl px-5 py-14 text-center sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-sky-700 shadow-sm ring-1 ring-sky-100 dark:bg-slate-900 dark:text-sky-300 dark:ring-slate-700">
            📘 Knowledge base · {articleCount} guides
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">How to use Looms &amp; Berries Tasks</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-300">
            Real screenshots with numbered arrows showing exactly where to click. Hover a step to
            highlight it on the picture.
          </p>
          <div className="mx-auto mt-8 max-w-xl">
            <GuideSearch />
          </div>
        </div>
      </section>

      {/* Quick starts */}
      <section data-hide-when-searching className="mx-auto max-w-7xl px-5 py-12 sm:px-6">
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
                    </a>
                  </li>
                ))}
              </ol>
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
            </a>
          ))}
        </div>
      </section>

      {/* Body: TOC + articles */}
      <div className="mx-auto max-w-7xl px-5 pb-16 sm:px-6 lg:grid lg:grid-cols-[230px_1fr] lg:gap-10">
        <aside className="hidden lg:block">
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
          </nav>
        </aside>

        <main id="main-content" className="min-w-0">
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

          {/* Keyboard shortcuts */}
          <section data-hide-when-searching className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/40">
            <h2 className="text-lg font-bold">⌨️ Handy shortcuts</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              {[
                ["Ctrl / ⌘ + K", "Search anything, or create a task"],
                ["Ctrl / ⌘ + V", "Paste a screenshot into a task, comment or chat"],
                ["@name", "Mention someone in a comment"],
                ["Esc", "Close a dialog or the search box"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center gap-3">
                  <dt>
                    <kbd className="rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs shadow-sm dark:border-slate-600 dark:bg-slate-800">{k}</kbd>
                  </dt>
                  <dd className="text-slate-600 dark:text-slate-300">{v}</dd>
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

          <section className="mt-14 rounded-2xl bg-gradient-to-br from-slate-900 to-sky-900 p-8 text-center text-white">
            <h2 className="text-2xl font-bold">Still stuck?</h2>
            <p className="mx-auto mt-2 max-w-md text-sky-50/90">
              Message your manager or an admin from inside the app — or email us and we&apos;ll help.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link href="/login" className="rounded-lg bg-white px-5 py-2.5 font-semibold text-sky-800 hover:bg-sky-50">
                Open the app
              </Link>
              <a href="mailto:sales@loomsberries.com?subject=Help%20with%20Looms%20%26%20Berries%20Tasks" className="rounded-lg border border-white/40 px-5 py-2.5 font-semibold hover:bg-white/10">
                Email support
              </a>
            </div>
          </section>
        </main>
      </div>

      <footer className="border-t border-slate-200 py-8 dark:border-slate-800">
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
