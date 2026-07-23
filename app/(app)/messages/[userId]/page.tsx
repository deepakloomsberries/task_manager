import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { sendDirectMessage } from "@/lib/actions/messages";
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

export default async function ConversationPage({ params }: { params: { userId: string } }) {
  const user = await requireUser();
  const otherId = Number(params.userId);
  if (!otherId || otherId === user.id) notFound();

  const other = await db.user.findUnique({ where: { id: otherId } });
  if (!other) notFound();

  // Mark the messages this person sent us as read now that we're viewing them.
  await db.directMessage.updateMany({
    where: { senderId: otherId, recipientId: user.id, read: false },
    data: { read: true },
  });

  const messages = await db.directMessage.findMany({
    where: {
      OR: [
        { senderId: user.id, recipientId: otherId },
        { senderId: otherId, recipientId: user.id },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  const groups: { label: string; items: typeof messages }[] = [];
  for (const m of messages) {
    const label = dayLabel(m.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/messages" className="text-sm text-slate-500 hover:underline">
          ←
        </Link>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor(other.name)}`}
        >
          {initials(other.name)}
        </span>
        <div>
          <h1 className="font-semibold leading-tight">{other.name}</h1>
          <p className="text-xs text-slate-500">{other.jobTitle ?? other.email}</p>
        </div>
        <a href={`/messages/${otherId}`} className="btn-secondary ml-auto !py-1.5 text-xs">
          ↻ Refresh
        </a>
      </div>

      <div id="chat-scroll" className="card flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">
            No messages yet. Say hello to {other.name.split(" ")[0]}.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.label} className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[11px] font-medium text-slate-500">
                {g.label}
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            {g.items.map((m) => {
              const mine = m.senderId === user.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-xl px-4 py-2.5 ${
                      mine ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                    <div className={`mt-0.5 text-[10px] ${mine ? "text-sky-200" : "text-slate-400"}`}>
                      {timeLabel(m.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <form action={sendDirectMessage} key={messages.length} className="card flex gap-3 p-4">
        <input type="hidden" name="recipientId" value={otherId} />
        <textarea
          name="body"
          rows={2}
          required
          maxLength={4000}
          placeholder={`Message ${other.name.split(" ")[0]}…`}
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
