import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtSize } from "@/lib/storage";
import { fmtDateTime } from "@/lib/ui";
import DocumentsTable, { type DocRow } from "@/components/DocumentsTable";
import AutoRefresh from "@/components/AutoRefresh";
import PasteAttachment from "@/components/PasteAttachment";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  badlink: "That doesn't look like a valid link — it should start with http:// or https://.",
};

export default async function DocumentsPage(
  props: {
    searchParams: Promise<{ error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  const attachments = await db.attachment.findMany({
    // Files shared inside a 1:1 chat or a group are private to that
    // conversation's members, not company documents — they belong in that
    // chat's own media/docs view (see ChatInfoPanel), not this shared
    // library. Only old company-wide Discussion-post attachments (from
    // before groups existed) stay here, since that channel really was
    // visible to everyone — unlike an arbitrary group can be.
    where: { messageId: null, groupMessageId: null },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: true, clientContact: { select: { name: true } }, task: true },
  });

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
  }));

  return (
    <div className="space-y-4">
      <AutoRefresh />
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-sm text-slate-500">
            All files shared in the company — {attachments.length} files, {fmtSize(totalSize)} total.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="card p-5">
        <PasteAttachment listenPaste={false} />
      </div>

      <DocumentsTable rows={rows} />
    </div>
  );
}
