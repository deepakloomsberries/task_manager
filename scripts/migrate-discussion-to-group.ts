import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/**
 * One-time migration: the old single company-wide Discussion channel
 * (DiscussionMessage) is replaced by WhatsApp-style groups. This creates a
 * "General" group owned by the earliest admin, adds every active user as a
 * member, and copies the existing DiscussionMessage history (and their
 * attachments) into it as GroupMessage rows, preserving author, timestamps
 * and deleted state.
 *
 * Safe to run more than once — skipped entirely if a "General" group
 * already exists.
 */
async function main() {
  const existing = await db.group.findFirst({ where: { name: "General" } });
  if (existing) {
    console.log(`"General" group already exists (id ${existing.id}) — skipping.`);
    return;
  }

  const admin = await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { id: "asc" } });
  const owner = admin ?? (await db.user.findFirstOrThrow({ orderBy: { id: "asc" } }));

  const activeUsers = await db.user.findMany({ where: { active: true }, select: { id: true } });
  const oldMessages = await db.discussionMessage.findMany({
    orderBy: { id: "asc" },
    include: { attachments: true },
  });

  const group = await db.group.create({
    data: {
      name: "General",
      createdById: owner.id,
      members: { create: activeUsers.map((u) => ({ userId: u.id })) },
    },
  });

  for (const m of oldMessages) {
    const newMsg = await db.groupMessage.create({
      data: {
        groupId: group.id,
        senderId: m.authorId,
        body: m.body,
        createdAt: m.createdAt,
        deletedAt: m.deletedAt,
      },
    });
    if (m.attachments.length) {
      await db.attachment.updateMany({
        where: { id: { in: m.attachments.map((a) => a.id) } },
        data: { groupMessageId: newMsg.id, discussionMessageId: null },
      });
    }
  }

  console.log(
    `Created "General" group (id ${group.id}) with ${activeUsers.length} members and migrated ${oldMessages.length} messages.`
  );
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
