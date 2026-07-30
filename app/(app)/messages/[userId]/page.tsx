import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import ChatThread from "@/components/ChatThread";

export const dynamic = "force-dynamic";

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

  const [messages, lastRead] = await Promise.all([
    db.directMessage.findMany({
      where: {
        OR: [
          { senderId: user.id, recipientId: otherId },
          { senderId: otherId, recipientId: user.id },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    }),
    db.directMessage.findFirst({
      where: { senderId: user.id, recipientId: otherId, read: true },
      orderBy: { id: "desc" },
      select: { id: true },
    }),
  ]);

  return (
    <ChatThread
      meId={user.id}
      other={{
        id: other.id,
        name: other.name,
        jobTitle: other.jobTitle,
        email: other.email,
        avatarPath: other.avatarPath,
      }}
      initialMessages={messages.map((m) => ({
        id: m.id,
        body: m.body,
        senderId: m.senderId,
        createdAt: m.createdAt.toISOString(),
      }))}
      initialLastReadMyId={lastRead?.id ?? 0}
      initialPartnerLastSeenAt={other.lastSeenAt ? other.lastSeenAt.toISOString() : null}
    />
  );
}
