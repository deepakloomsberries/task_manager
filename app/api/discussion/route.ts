import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/**
 * Polling endpoint that powers the live company-wide discussion board. Returns
 * any messages newer than `after`, plus the ids of messages deleted recently so
 * already-loaded bubbles can flip to tombstones without a full reload.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const after = Number(req.nextUrl.searchParams.get("after") ?? 0) || 0;
  const recentlyDeletedSince = new Date(Date.now() - 15 * 60_000);

  const [messages, deleted] = await Promise.all([
    db.discussionMessage.findMany({
      where: { id: { gt: after } },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        author: { include: { company: true } },
        attachments: { select: { id: true, originalName: true, mimeType: true, size: true }, orderBy: { id: "asc" } },
      },
    }),
    db.discussionMessage.findMany({
      where: { deletedAt: { gte: recentlyDeletedSince } },
      select: { id: true },
    }),
  ]);

  return NextResponse.json({
    messages: messages.map((m) => {
      const isDeleted = !!m.deletedAt;
      return {
        id: m.id,
        body: isDeleted ? "" : m.body,
        authorId: m.authorId,
        authorName: m.author.name,
        authorCompany: m.author.company.code,
        createdAt: m.createdAt.toISOString(),
        deleted: isDeleted,
        attachments: isDeleted
          ? []
          : m.attachments.map((a) => ({ id: a.id, name: a.originalName, mimeType: a.mimeType, size: a.size })),
      };
    }),
    deletedIds: deleted.map((d) => d.id),
  });
}
