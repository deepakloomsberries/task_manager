import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { uploadAttachment } from "@/lib/actions/files";
import { fmtSize } from "@/lib/storage";
import { fmtDateTime } from "@/lib/ui";
import DocumentsTable, { type DocRow } from "@/components/DocumentsTable";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  nofile: "Please choose a file to upload.",
  toobig: "File is too large — maximum size is 20 MB.",
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const user = await requireUser();
  const attachments = await db.attachment.findMany({
    // Files shared inside a 1:1 chat are private to that conversation, not
    // company documents — they belong in Messages' own media/docs view (see
    // ChatInfoPanel), not this shared library. Discussion-post attachments
    // stay here since that feed is already company-wide, like this page.
    where: { messageId: null },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: true, task: true },
  });

  const error = searchParams.error ? ERRORS[searchParams.error] : null;
  const totalSize = attachments.reduce((s, a) => s + a.size, 0);

  const rows: DocRow[] = attachments.map((a) => ({
    id: a.id,
    originalName: a.originalName,
    sizeLabel: fmtSize(a.size),
    dateLabel: fmtDateTime(a.createdAt),
    uploadedByName: a.uploadedBy.name,
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
        <form action={uploadAttachment} className="flex flex-wrap items-center gap-3">
          <input type="file" name="file" required className="input max-w-md" />
          <button type="submit" className="btn-primary">
            Upload document
          </button>
          <span className="text-xs text-slate-400">Max 20 MB per file.</span>
        </form>
      </div>

      <DocumentsTable rows={rows} />
    </div>
  );
}
