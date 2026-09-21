import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import AutoRefresh from "@/components/AutoRefresh";
import GroupsShell from "@/components/GroupsShell";
import GroupsSidebar, { type GroupSummary } from "@/components/GroupsSidebar";

export const dynamic = "force-dynamic";

export default async function DiscussionLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const [memberships, users] = await Promise.all([
    db.groupMember.findMany({
      where: { userId: user.id },
      select: {
        lastReadAt: true,
        group: {
          select: {
            id: true,
            name: true,
            _count: { select: { members: true } },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { body: true, createdAt: true, senderId: true, sender: { select: { name: true } } },
            },
          },
        },
      },
    }),
    db.user.findMany({
      where: { active: true, id: { not: user.id } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, jobTitle: true, avatarPath: true },
    }),
  ]);

  const groups: GroupSummary[] = await Promise.all(
    memberships.map(async (m) => {
      const last = m.group.messages[0];
      const unread = await db.groupMessage.count({
        where: { groupId: m.group.id, deletedAt: null, senderId: { not: user.id }, createdAt: { gt: m.lastReadAt } },
      });
      return {
        id: m.group.id,
        name: m.group.name,
        memberCount: m.group._count.members,
        lastBody: last?.body ?? "",
        lastAt: last?.createdAt ?? null,
        lastSenderName: last?.sender.name ?? null,
        fromMe: last?.senderId === user.id,
        unread,
      };
    })
  );
  groups.sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0));

  return (
    <>
      <AutoRefresh />
      <GroupsShell sidebar={<GroupsSidebar groups={groups} users={users} />}>{children}</GroupsShell>
    </>
  );
}
