import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { uploadAttachment, deleteAttachment } from "@/lib/actions/files";
import { fmtSize } from "@/lib/storage";
import { fmtDateTime } from "@/lib/ui";

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
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: true, task: true },
  });

  const error = searchParams.error ? ERRORS[searchParams.error] : null;
  const totalSize = attachments.reduce((s, a) => s + a.size, 0);

  return (
    <div className="space-y-4">
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

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th">File</th>
              <th className="th">Size</th>
              <th className="th">Linked task</th>
              <th className="th">Uploaded by</th>
              <th className="th">Date</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {attachments.length === 0 && (
              <tr>
                <td colSpan={6} className="td py-10 text-center text-slate-400">
                  No documents uploaded yet.
                </td>
              </tr>
            )}
            {attachments.map((a) => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="td">
                  <a
                    href={`/api/files/${a.id}`}
                    target="_blank"
                    className="font-medium text-sky-700 hover:underline"
                  >
                    {a.originalName}
                  </a>
                </td>
                <td className="td text-slate-600">{fmtSize(a.size)}</td>
                <td className="td text-slate-600">
                  {a.task ? (
                    <Link href={`/tasks/${a.task.id}`} className="text-sky-700 hover:underline">
                      {a.task.title}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="td text-slate-600">{a.uploadedBy.name}</td>
                <td className="td text-slate-600">{fmtDateTime(a.createdAt)}</td>
                <td className="td text-right">
                  <div className="flex justify-end gap-3 text-xs">
                    <a href={`/api/files/${a.id}?download=1`} className="text-sky-600 hover:underline">
                      Download
                    </a>
                    {(a.uploadedById === user.id || user.role === "ADMIN") && (
                      <form action={deleteAttachment}>
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" className="text-red-600 hover:underline">
                          Delete
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
