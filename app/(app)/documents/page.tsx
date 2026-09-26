import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtSize } from "@/lib/storage";
import { fmtDateTime } from "@/lib/ui";
import DocumentsTable, { type DocRow } from "@/components/DocumentsTable";
import AutoRefresh from "@/components/AutoRefresh";
import { canManageSharing, isStandalone, publicLinkLive, visibleDocsWhere } from "@/lib/docAccess";
import PasteAttachment from "@/components/PasteAttachment";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  badlink: "That doesn't look like a valid link — it should start with http:// or https://.",
};

export default async function DocumentsPage(
  props: {
    searchParams: Promise<{ error?: string; tab?: string; share?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  const tab = ["mine", "shared", "public"].includes(searchParams.tab ?? "") ? searchParams.tab! : "all";
  const visible = visibleDocsWhere(user);
  const tabWhere =
    tab === "mine"
      ? { uploadedById: user.id }
      : tab === "shared"
        ? { shares: { some: { userId: user.id } } }
        : tab === "public"
          ? { access: "PUBLIC", shareToken: { not: null } }
          : {};
  const [attachments, counts] = await Promise.all([
    db.attachment.findMany({
      // Chat, group and note files are private to those conversations/notes;
      // task files follow the task; Documents files follow their sharing.
      where: { AND: [visible, tabWhere] },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: true, clientContact: { select: { name: true } }, task: true, _count: { select: { shares: true } } },
    }),
    Promise.all([
      db.attachment.count({ where: { AND: [visible, { shares: { some: { userId: user.id } } }] } }),
      db.attachment.count({ where: { AND: [visible, { access: "PUBLIC", shareToken: { not: null } }] } }),
    ]),
  ]);
  const error = searchParams.error ? ERRORS[searchParams.error] : null;
  const totalSize = attachments.reduce((s, a) => s + a.size, 0);

  const rows: DocRow[] = attachments.map((a) => ({
    id: a.id,
    originalName: a.originalName,
    isLink: !a.storedName,
    externalUrl: a.externalUrl,
    sizeLabel: fmtSize(a.size),
    dateLabel: fmtDateTime(a.createdAt),
    uploadedByName: a.uploadedBy?.name ?? `${a.clientContact?.name ?? "Client"} (client)`,
    taskId: a.task?.id ?? null,
    taskTitle: a.task?.title ?? null,
    canDelete: a.uploadedById === user.id || user.role === "ADMIN",
    access: publicLinkLive(a) ? "PUBLIC" : a.access === "RESTRICTED" && isStandalone(a) ? "RESTRICTED" : "COMPANY",
    sharedCount: a._count.shares,
    canShare: canManageSharing(a, user),
  }));
  const tabs = [
    { key: "all", label: "All files" },
    { key: "mine", label: "My uploads" },
    { key: "shared", label: `Shared with me${counts[0] ? ` (${counts[0]})` : ""}` },
    { key: "public", label: `🌐 Public links${counts[1] ? ` (${counts[1]})` : ""}` },
  ];

  return (
    <div className="space-y-4">
      <AutoRefresh />
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-sm text-slate-500">
            Upload a file, then <b>Share</b> it with people or make a public link anyone can download — {attachments.length} files,{" "}
            {fmtSize(totalSize)}.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="card p-5">
        <PasteAttachment listenPaste={false} shareAfterUpload />
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700" aria-label="Documents views">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={t.key === "all" ? "/documents" : `/documents?tab=${t.key}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key ? "border-sky-600 text-sky-700 dark:text-sky-400" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </a>
        ))}
      </nav>

      <DocumentsTable rows={rows} openShare={searchParams.share ? Number(searchParams.share) || null : null} />
    </div>
  );
}
