import type { Metadata } from "next";
import { db } from "@/lib/db";
import { fmtSize } from "@/lib/storage";
import { publicLinkLive } from "@/lib/docAccess";
import { canShowInline } from "@/lib/fileResponse";
import { isUnlocked } from "@/lib/publicAccess";
import PublicPasswordForm from "@/components/PublicPasswordForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shared file · Looms & Berries", robots: { index: false, follow: false } };

/** The page someone outside the company sees when you send them a file link. */
export default async function PublicFilePage(props: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await props.params;
  const { error } = await props.searchParams;
  const a = /^[A-Za-z0-9_-]{20,64}$/.test(token)
    ? await db.attachment.findFirst({ where: { shareToken: token }, include: { uploadedBy: { select: { name: true } } } })
    : null;
  const live = !!a && publicLinkLive(a);
  const locked = live && !(await isUnlocked("f", token, a!.sharePasswordHash));
  const src = `/api/public/${token}`;
  const isImage = live && !!a!.storedName && a!.mimeType.startsWith("image/") && canShowInline(a!.mimeType);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-slate-50 to-slate-100 p-4 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <div className="card w-full max-w-lg p-8 text-center">
        <div className="mb-6 text-2xl font-bold">
          Looms <span className="text-sky-600">&amp;</span> Berries
        </div>
        {locked ? (
          <PublicPasswordForm kind="f" token={token} error={error} />
        ) : !live ? (
          <>
            <div className="mb-2 text-5xl">🔒</div>
            <h1 className="text-lg font-semibold">This link isn&apos;t available</h1>
            <p className="mt-1 text-sm text-slate-500">It may have expired or been switched off. Ask the person who sent it for a new link.</p>
          </>
        ) : (
          <>
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={a!.originalName} className="mx-auto mb-4 max-h-72 rounded-lg object-contain shadow-sm" />
            ) : (
              <div className="mb-3 text-6xl">{a!.storedName ? (a!.mimeType === "application/pdf" ? "📕" : "📄") : "🔗"}</div>
            )}
            <h1 className="break-words text-lg font-semibold">{a!.originalName}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {a!.storedName ? fmtSize(a!.size) + " · " : ""}Shared by {a!.uploadedBy?.name.split(" ")[0] ?? "Looms & Berries"}
              {a!.shareExpiresAt && (
                <> · link works until {a!.shareExpiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</>
              )}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {a!.storedName ? (
                <>
                  <a href={`${src}?download=1`} className="btn-primary px-6">
                    ⬇ Download
                  </a>
                  {canShowInline(a!.mimeType) && (
                    <a href={src} target="_blank" rel="noreferrer" className="btn-secondary">
                      Open
                    </a>
                  )}
                </>
              ) : (
                <a href={src} rel="noreferrer" className="btn-primary px-6">
                  Open link
                </a>
              )}
            </div>
          </>
        )}
        <p className="mt-8 text-xs text-slate-400">Shared securely from the Looms &amp; Berries workspace.</p>
      </div>
    </main>
  );
}
