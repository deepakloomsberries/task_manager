import { db } from "@/lib/db";
import { replyToClient, setTaskClientVisible } from "@/lib/actions/clients";
import { fmtRelative } from "@/lib/ui";
import UserAvatar from "@/components/UserAvatar";

/**
 * The "Client" card on a task in a client's project: share it in the portal,
 * see the client's sign-off, and talk with them. The conversation is separate
 * from the internal Discussion — clients never see internal comments.
 */
export default async function ClientPanel({
  task,
  client,
  canShare,
  backTo,
}: {
  task: { id: number; clientVisible: boolean; clientStatus: string | null; clientStatusAt: Date | null; clientStatusBy: string | null };
  client: { name: string };
  canShare: boolean;
  backTo: string;
}) {
  const comments = await db.clientComment.findMany({
    where: { taskId: task.id },
    include: { contact: { select: { name: true } }, user: { select: { id: true, name: true, avatarPath: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div id="client" className="card scroll-mt-20 border-violet-200 p-6 dark:border-violet-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">
          👁 Client — {client.name}
          {task.clientVisible ? (
            <span className="badge ml-2 bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">Shared</span>
          ) : (
            <span className="badge ml-2 bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300">Internal only</span>
          )}
        </h2>
        {canShare && (
          <form action={setTaskClientVisible}>
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="visible" value={task.clientVisible ? "0" : "1"} />
            <input type="hidden" name="back" value={backTo} />
            <button type="submit" className={task.clientVisible ? "btn-secondary text-sm" : "btn-primary text-sm"}>
              {task.clientVisible ? "Hide from client" : "Share with client"}
            </button>
          </form>
        )}
      </div>
      <p className="mb-4 text-xs text-slate-500">
        {task.clientVisible
          ? "The client can see this task's title, description, status and due date, and only the files you mark “Client sees” below — never the internal discussion, time or subtasks. They can add files too."
          : "Only your team can see this task. Share it to show its progress and files to the client in their portal."}
      </p>

      {task.clientStatus && (
        <div
          className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${
            task.clientStatus === "APPROVED"
              ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300"
              : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          }`}
        >
          {task.clientStatus === "APPROVED" ? "✅ Approved" : "✏️ Changes requested"} by <b>{task.clientStatusBy}</b>{" "}
          {task.clientStatusAt && <span className="opacity-70">· {fmtRelative(task.clientStatusAt)}</span>}
        </div>
      )}

      {task.clientVisible && (
        <>
          <div className="space-y-3">
            {comments.length === 0 && <p className="text-sm text-slate-400">No messages with the client yet.</p>}
            {comments.map((c) => (
              <div key={c.id} className={`flex gap-3 ${c.user ? "" : "flex-row-reverse text-right"}`}>
                {c.user ? (
                  <UserAvatar user={c.user} size={28} />
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                    {(c.contact?.name ?? "?").charAt(0).toUpperCase()}
                  </span>
                )}
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${c.user ? "bg-slate-50 dark:bg-slate-700/50" : "bg-violet-50 dark:bg-violet-950/30"}`}>
                  <div className="mb-0.5 text-xs text-slate-500">
                    <b>{c.user?.name ?? c.contact?.name ?? "Client"}</b>
                    {!c.user && ` · ${client.name}`} · {fmtRelative(c.createdAt)}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-left">{c.body}</div>
                </div>
              </div>
            ))}
          </div>
          <form key={comments.length} action={replyToClient} className="mt-4 space-y-2">
            <input type="hidden" name="taskId" value={task.id} />
            <input type="hidden" name="back" value={backTo} />
            <textarea name="body" required rows={2} maxLength={4000} className="input" placeholder={`Reply to ${client.name}… (they get an email)`} />
            <button type="submit" className="btn-primary text-sm">
              Send to client
            </button>
          </form>
        </>
      )}
    </div>
  );
}
