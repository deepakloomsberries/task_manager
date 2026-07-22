import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { postMessage, deleteMessage } from "@/lib/actions/discussion";
import { initials, avatarColor } from "@/lib/ui";

export const dynamic = "force-dynamic";

function dayLabel(d: Date) {
  const today = new Date();
  const date = new Date(d);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(date)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function timeLabel(d: Date) {
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default async function DiscussionPage() {
  const user = await requireUser();
  const messages = await db.discussionMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { author: { include: { company: true } } },
  });
  messages.reverse();

  const groups: { label: string; items: typeof messages }[] = [];
  for (const m of messages) {
    const label = dayLabel(m.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Discussion</h1>
          <p className="text-sm text-slate-500">
            Company-wide chat — visible to all employees across IND, UAE and KSA.
          </p>
        </div>
        <a href="/discussion" className="btn-secondary !py-1.5 text-xs">
          ↻ Refresh
        </a>
      </div>

      <div id="chat-scroll" className="card flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">
            No messages yet. Start the conversation.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.label} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[11px] font-medium text-slate-500">
                {g.label}
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            {g.items.map((m) => {
              const mine = m.authorId === user.id;
              return (
                <div key={m.id} className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}>
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor(m.author.name)}`}
                  >
                    {initials(m.author.name)}
                  </div>
                  <div
                    className={`max-w-[75%] rounded-xl px-4 py-2.5 ${
                      mine ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    <div className="mb-0.5 flex items-baseline gap-2">
                      <span
                        className={`text-xs font-semibold ${mine ? "text-sky-100" : "text-slate-600"}`}
                      >
                        {m.author.name} · {m.author.company.code}
                      </span>
                      <span className={`text-[10px] ${mine ? "text-sky-200" : "text-slate-400"}`}>
                        {timeLabel(m.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                    {(mine || user.role === "ADMIN") && (
                      <form action={deleteMessage} className="mt-1 text-right">
                        <input type="hidden" name="id" value={m.id} />
                        <button
                          type="submit"
                          className={`text-[10px] ${
                            mine
                              ? "text-sky-200 hover:text-white"
                              : "text-slate-400 hover:text-red-600"
                          }`}
                        >
                          delete
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <form action={postMessage} key={messages.length} className="card flex gap-3 p-4">
        <textarea
          name="body"
          rows={2}
          required
          maxLength={4000}
          placeholder="Write a message to the whole team…"
          className="input flex-1"
        />
        <button type="submit" className="btn-primary self-end">
          Send
        </button>
      </form>

      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var el=document.getElementById("chat-scroll");if(el)el.scrollTop=el.scrollHeight;})();`,
        }}
      />
    </div>
  );
}
