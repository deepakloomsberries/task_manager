"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { deleteAttachment, deleteAttachments } from "@/lib/actions/files";
import ConfirmButton from "@/components/ConfirmButton";
import ConfirmDialog from "@/components/ConfirmDialog";

export type DocRow = {
  id: number;
  originalName: string;
  sizeLabel: string;
  dateLabel: string;
  uploadedByName: string;
  taskId: number | null;
  taskTitle: string | null;
  canDelete: boolean;
};

export default function DocumentsTable({ rows }: { rows: DocRow[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);

  const deletableIds = useMemo(() => rows.filter((r) => r.canDelete).map((r) => r.id), [rows]);
  const allSelected = deletableIds.length > 0 && deletableIds.every((id) => selected.has(id));
  const selectedCount = selected.size;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(deletableIds));
  }

  const selectedIds = useMemo(
    () => rows.filter((r) => selected.has(r.id)).map((r) => r.id),
    [rows, selected],
  );

  return (
    <div className="space-y-3">
      {/* Bulk action bar — appears only when something is selected. */}
      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm dark:border-sky-900 dark:bg-sky-950/40">
          <span className="font-medium text-sky-800 dark:text-sky-200">
            {selectedCount} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="btn-secondary !py-1.5 text-xs"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setConfirmBulk(true)}
              className="btn-danger !py-1.5 text-xs"
            >
              Delete selected
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="th w-10">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  className="h-4 w-4 cursor-pointer accent-sky-600"
                  checked={allSelected}
                  disabled={deletableIds.length === 0}
                  onChange={toggleAll}
                />
              </th>
              <th className="th">File</th>
              <th className="th">Size</th>
              <th className="th">Linked task</th>
              <th className="th">Uploaded by</th>
              <th className="th">Date</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="td py-10 text-center text-slate-400">
                  No documents uploaded yet.
                </td>
              </tr>
            )}
            {rows.map((a) => {
              const isSel = selected.has(a.id);
              return (
                <tr key={a.id} className={isSel ? "bg-sky-50/70 dark:bg-sky-950/30" : "hover:bg-slate-50"}>
                  <td className="td">
                    <input
                      type="checkbox"
                      aria-label={`Select ${a.originalName}`}
                      className="h-4 w-4 cursor-pointer accent-sky-600 disabled:cursor-not-allowed disabled:opacity-30"
                      checked={isSel}
                      disabled={!a.canDelete}
                      title={a.canDelete ? undefined : "You can only delete files you uploaded."}
                      onChange={() => toggle(a.id)}
                    />
                  </td>
                  <td className="td">
                    <a
                      href={`/api/files/${a.id}`}
                      target="_blank"
                      className="font-medium text-sky-700 hover:underline"
                    >
                      {a.originalName}
                    </a>
                  </td>
                  <td className="td text-slate-600">{a.sizeLabel}</td>
                  <td className="td text-slate-600">
                    {a.taskId ? (
                      <Link href={`/tasks/${a.taskId}`} className="text-sky-700 hover:underline">
                        {a.taskTitle}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="td text-slate-600">{a.uploadedByName}</td>
                  <td className="td text-slate-600">{a.dateLabel}</td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-3 text-xs">
                      <a href={`/api/files/${a.id}?download=1`} className="text-sky-600 hover:underline">
                        Download
                      </a>
                      {a.canDelete && (
                        <form action={deleteAttachment}>
                          <input type="hidden" name="id" value={a.id} />
                          <ConfirmButton
                            message={`Delete "${a.originalName}"? This can't be undone.`}
                            className="text-red-600 hover:underline"
                          >
                            Delete
                          </ConfirmButton>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Hidden form that carries the selected ids to the bulk-delete action. */}
      <form id="bulk-delete-form" action={deleteAttachments}>
        <input type="hidden" name="ids" value={selectedIds.join(",")} />
      </form>
      <ConfirmDialog
        open={confirmBulk}
        message={`Delete ${selectedCount} selected document${selectedCount === 1 ? "" : "s"}? This can't be undone.`}
        confirmLabel="Delete selected"
        onCancel={() => setConfirmBulk(false)}
        onConfirm={() => {
          setConfirmBulk(false);
          (document.getElementById("bulk-delete-form") as HTMLFormElement | null)?.requestSubmit();
        }}
      />
    </div>
  );
}
