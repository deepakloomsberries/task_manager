import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDateTime } from "@/lib/ui";
import StartChat from "@/components/StartChat";
import AutoRefresh from "@/components/AutoRefresh";
import UserAvatar from "@/components/UserAvatar";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const user = await requireUser();

  const [messages, users] = await Promise.all([
    db.directMessage.findMany({
      where: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
      orderBy: { createdAt: "desc" },
      include: { sender: true, recipient: true },
      take: 500,
    }),
    db.user.findMany({ where: { active: true, id: { not: user.id } }, orderBy: { name: "asc" } }),
  ]);

  type Convo = {
    partner: { id: number; name: string; avatarPath: string | null };
    lastBody: string;
    lastAt: Date;
    fromMe: boolean;
    unread: number;
  };
  const convos = new Map<number, Convo>();
  for (const m of messages) {
    const partner = m.senderId === user.id ? m.recipient : m.sender;
    const existing = convos.get(partner.id);
    if (!existing) {
      convos.set(partner.id, {
        partner,
        lastBody: m.body,
        lastAt: m.createdAt,
        fromMe: m.senderId === user.id,
        unread: 0,
      });
    }
    if (m.recipientId === user.id && !m.read) {
      const c = convos.get(partner.id)!;
      c.unread += 1;
    }
  }
  const conversations = Array.from(convos.values()).sort(
    (a, b) => b.lastAt.getTime() - a.lastAt.getTime()
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <AutoRefresh />
      <div>
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="text-sm text-slate-500">Private one-to-one chats with your teammates.</p>
      </div>

      <div className="card p-4">
        <label className="label">Start a new conversation</label>
        <StartChat users={users} />
      </div>

      <div className="card divide-y divide-slate-100">
        {conversations.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-400">
            No conversations yet. Pick someone above to start chatting.
          </p>
        )}
        {conversations.map((c) => (
          <Link
            key={c.partner.id}
            href={`/messages/${c.partner.id}`}
            className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"
          >
            <UserAvatar user={c.partner} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{c.partner.name}</span>
                <span className="shrink-0 text-[11px] text-slate-400">{fmtDateTime(c.lastAt)}</span>
              </div>
              <div className="truncate text-xs text-slate-500">
                {c.fromMe ? "You: " : ""}
                {c.lastBody}
              </div>
            </div>
            {c.unread > 0 && (
              <span className="shrink-0 rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                {c.unread}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
