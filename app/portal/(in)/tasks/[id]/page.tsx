import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { clientTask, requireClient } from "@/lib/clientAuth";
import { clientComment, clientSignOff } from "@/lib/actions/portal";
import { fmtRelative } from "@/lib/ui";
import FlashToast from "@/components/FlashToast";
import { awaitingClient, fmtDay, stage } from "../../status";

export const dynamic = "force-dynamic";

const OK: Record<string, string> = {
  comment: "Message sent to the team.",
  approved: "Approved — thank you! The team has been notified.",
  changes: "Your change request was sent to the team.",
};

const fmtSize = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function PortalTask({ params, searchParams }: { params: { id: string }; searchParams: { ok?: string; error?: string } }) {
  const contact = await requireClient();
  const task = await clientTask(contact.clientId, Number(params.id));
  if (!task) notFound();

  const [attachments, comments] = await Promise.all([
    db.attachment.findMany({ where: { taskId: task.id }, orderBy: { createdAt: "desc" } }),
    db.clientComment.findMany({
      where: { taskId: task.id },
      include: { contact: { select: { name: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const st = stage(task.status);

  return (
    <div className="space-y-5">
      {searchParams.ok && OK[searchParams.ok] && <FlashToast message={OK[searchParams.ok]} />}
      <Link href={`/portal/projects/${task.project!.id}`} className="text-sm text-slate-500 hover:underline">
        ← {task.project!.name}
      </Link>

      <div className="card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold">{task.title}</h1>
          <span className={`badge ${st.badge}`}>{st.label}</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {task.status === "DONE" ? `Done ${fmtDay(task.completedAt)}` : `Due ${fmtDay(task.dueDate)}`}
        </p>
        {task.description && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{task.description}</p>}
      </div>

      <section id="signoff" className="card scroll-mt-20 p-6" aria-label="Your sign-off">
        <h2 className="mb-3 font-semibold">Your sign-off</h2>
        {task.clientStatus === "APPROVED" ? (
          <p className="text-sm text-green-700 dark:text-green-400">
            ✅ Approved by {task.clientStatusBy} {task.clientStatusAt && `· ${fmtRelative(task.clientStatusAt)}`}
          </p>
        ) : awaitingClient(task) ? (
          <div className="space-y-3">
            {task.clientStatus === "CHANGES" && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                ✏️ Changes requested by {task.clientStatusBy}. Approve once you&apos;re happy with the update.
              </p>
            )}
            <p className="text-sm text-slate-600 dark:text-slate-300">Please check the work and files, then approve it or tell us what to change.</p>
            {searchParams.error === "note" && <p className="text-sm text-red-600">Tell us what needs changing.</p>}
            <form action={clientSignOff} className="space-y-2">
              <input type="hidden" name="taskId" value={task.id} />
              <textarea name="note" rows={2} maxLength={4000} className="input" placeholder="Comments (needed if you ask for changes)" />
              <div className="flex flex-wrap gap-2">
                <button type="submit" name="decision" value="approve" className="btn-primary">
                  ✅ Approve
                </button>
                <button type="submit" name="decision" value="changes" className="btn-secondary">
                  ✏️ Request changes
                </button>
              </div>
            </form>
          </div>
        ) : (
          <p className="text-sm text-slate-500">We&apos;ll ask for your approval when the team has finished this step.</p>
        )}
      </section>

      <section className="card p-6" aria-label="Files">
        <h2 className="mb-3 font-semibold">
          Files <span className="text-sm font-normal text-slate-400">({attachments.length})</span>
        </h2>
        {attachments.length === 0 ? (
          <p className="text-sm text-slate-400">No files yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                <span>{a.storedName ? (a.mimeType.startsWith("image/") ? "🖼" : "📄") : "🔗"}</span>
                <a
                  href={a.storedName ? `/api/portal/files/${a.id}` : a.externalUrl!}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 truncate text-sky-700 hover:underline dark:text-sky-400"
                >
                  {a.originalName}
                </a>
                {a.storedName && (
                  <>
                    <span className="text-xs text-slate-400">{fmtSize(a.size)}</span>
                    <a href={`/api/portal/files/${a.id}?download=1`} className="text-xs text-slate-500 hover:underline">
                      Download
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="conversation" className="card scroll-mt-20 p-6" aria-label="Conversation">
        <h2 className="mb-3 font-semibold">Conversation with the team</h2>
        <div className="space-y-3">
          {comments.length === 0 && <p className="text-sm text-slate-400">No messages yet — ask a question below.</p>}
          {comments.map((c) => {
            const mine = !c.user;
            return (
              <div key={c.id} className={`flex ${mine ? "justify-end" : ""}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-violet-50 dark:bg-violet-950/30" : "bg-slate-50 dark:bg-slate-700/50"}`}>
                  <div className="mb-0.5 text-xs text-slate-500">
                    <b>{c.user ? `${c.user.name} · Looms & Berries` : c.contact?.name ?? "You"}</b> · {fmtRelative(c.createdAt)}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{c.body}</div>
                </div>
              </div>
            );
          })}
        </div>
        <form key={comments.length} action={clientComment} className="mt-4 space-y-2">
          <input type="hidden" name="taskId" value={task.id} />
          <textarea name="body" required rows={3} maxLength={4000} className="input" placeholder="Write a message to the team…" />
          <button type="submit" className="btn-primary">
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
