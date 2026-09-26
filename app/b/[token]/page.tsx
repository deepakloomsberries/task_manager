import type { Metadata } from "next";
import { fmtSize } from "@/lib/storage";
import { openBundle } from "@/lib/bundleAccess";
import PublicPasswordForm from "@/components/PublicPasswordForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shared files · Looms & Berries", robots: { index: false, follow: false } };

/** The page someone sees for a multi-file link: each file, plus Download all (.zip). */
export default async function BundlePage(props: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await props.params;
  const { error } = await props.searchParams;
  const { bundle, locked } = await openBundle(token);
  const base = `/api/public/b/${token}`;
  const files = bundle?.items.map((i) => i.attachment) ?? [];
  const total = files.reduce((s, a) => s + a.size, 0);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-slate-50 to-slate-100 p-4 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <div className="card w-full max-w-xl p-8">
        <div className="mb-6 text-center text-2xl font-bold">
          Looms <span className="text-sky-600">&amp;</span> Berries
        </div>
        {!bundle ? (
          <div className="text-center">
            <div className="mb-2 text-5xl">🔒</div>
            <h1 className="text-lg font-semibold">This link isn&apos;t available</h1>
            <p className="mt-1 text-sm text-slate-500">It may have expired or been switched off.</p>
          </div>
        ) : locked ? (
          <div className="text-center">
            <PublicPasswordForm kind="b" token={token} error={error} />
          </div>
        ) : (
          <>
            <h1 className="text-center text-lg font-semibold">{bundle.title}</h1>
            <p className="mb-5 text-center text-sm text-slate-500">
              {files.length} file{files.length === 1 ? "" : "s"} · {fmtSize(total)} · shared by {bundle.createdBy.name.split(" ")[0]}
              {bundle.expiresAt && (
                <> · until {bundle.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>
              )}
            </p>
            <ul className="mb-5 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
              {files.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span>{a.storedName ? (a.mimeType.startsWith("image/") ? "🖼" : "📄") : "🔗"}</span>
                  <span className="min-w-0 flex-1 truncate">{a.originalName}</span>
                  {a.storedName ? (
                    <>
                      <span className="text-xs text-slate-400">{fmtSize(a.size)}</span>
                      <a href={`${base}/${a.id}?download=1`} className="text-sky-700 hover:underline">
                        Download
                      </a>
                    </>
                  ) : (
                    <a href={a.externalUrl ?? "#"} rel="noreferrer" className="text-sky-700 hover:underline">
                      Open link
                    </a>
                  )}
                </li>
              ))}
            </ul>
            {files.filter((a) => a.storedName).length > 1 && (
              <div className="text-center">
                <a href={`${base}/zip`} className="btn-primary px-6">
                  ⬇ Download all (.zip)
                </a>
              </div>
            )}
          </>
        )}
        <p className="mt-8 text-center text-xs text-slate-400">Shared securely from the Looms &amp; Berries workspace.</p>
      </div>
    </main>
  );
}
