import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import DiscussionThread from "@/components/DiscussionThread";

export const dynamic = "force-dynamic";

export default async function DiscussionPage() {
  const user = await requireUser();
  const [rows, directory] = await Promise.all([
    db.discussionMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        author: { include: { company: true } },
        attachments: { select: { id: true, originalName: true, mimeType: true, size: true }, orderBy: { id: "asc" } },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, jobTitle: true } }),
  ]);
  rows.reverse();

  const initialMessages = rows.map((m) => {
    const deleted = !!m.deletedAt;
    return {
      id: m.id,
      body: deleted ? "" : m.body,
      authorId: m.authorId,
      authorName: m.author.name,
      authorCompany: m.author.company.code,
      createdAt: m.createdAt.toISOString(),
      deleted,
      attachments: deleted
        ? []
        : m.attachments.map((a) => ({ id: a.id, name: a.originalName, mimeType: a.mimeType, size: a.size })),
    };
  });

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Discussion</h1>
        <p className="text-sm text-slate-500">
          Company-wide chat — live for everyone across IND, UAE and KSA. Share files and photos, and
          type @ to mention a teammate.
        </p>
      </div>

      <DiscussionThread
        meId={user.id}
        isAdmin={user.role === "ADMIN"}
        initialMessages={initialMessages}
        users={directory}
      />
    </div>
  );
}
