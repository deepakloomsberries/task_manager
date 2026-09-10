import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import AutoRefresh from "@/components/AutoRefresh";
import MessagesShell from "@/components/MessagesShell";
import MessagesSidebar, { type Convo } from "@/components/MessagesSidebar";

export const dynamic = "force-dynamic";

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const [messages, users] = await Promise.all([
    db.directMessage.findMany({
      where: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
      orderBy: { createdAt: "desc" },
      include: { sender: true, recipient: true, attachments: { select: { mimeType: true } } },
      take: 500,
    }),
    db.user.findMany({ where: { active: true, id: { not: user.id } }, orderBy: { name: "asc" } }),
  ]);

  const convos = new Map<number, Convo>();
  for (const m of messages) {
    const partner = m.senderId === user.id ? m.recipient : m.sender;
    const existing = convos.get(partner.id);
    if (!existing) {
      const preview = m.deletedAt
        ? "🚫 Message deleted"
        : m.body ||
          (m.attachments.length
            ? m.attachments.some((a) => a.mimeType.startsWith("image/"))
              ? "📷 Photo"
              : "📎 Attachment"
            : "");
      convos.set(partner.id, {
        partner,
        lastBody: preview,
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
  const conversations = Array.from(convos.values()).sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());

  return (
    <div className="mx-auto max-w-6xl">
      <AutoRefresh />
      <MessagesShell sidebar={<MessagesSidebar conversations={conversations} users={users} />}>
        {children}
      </MessagesShell>
    </div>
  );
}
