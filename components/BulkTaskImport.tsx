"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type RowStatus = "create" | "update" | "created" | "updated" | "error" | "skip";
type RowResult = { row: number; title: string; status: RowStatus; reason?: string };
type Preview = { preview: true; willCreate: number; willUpdate: number; willSkip: number; failed: number; results: RowResult[] };
type Done = { created: number; updated: number; skipped: number; failed: number; results: RowResult[] };

const STYLE: Record<RowStatus, string> = {
  create: "bg-green-100 text-green-700",
  created: "bg-green-100 text-green-700",
  update: "bg-sky-100 text-sky-700",
  updated: "bg-sky-100 text-sky-700",
  skip: "bg-slate-100 text-slate-600",
  error: "bg-red-100 text-red-700",
};
const LABEL: Record<RowStatus, string> = {
  create: "will create", update: "will update", created: "created", updated: "updated", skip: "skipped", error: "error",
};

function ResultTable({ results }: { results: RowResult[] }) {
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="sticky top-0 bg-slate-50 text-left">
          <tr>
            <th className="px-3 py-2 font-medium text-slate-500">Row</th>
            <th className="px-3 py-2 font-medium text-slate-500">Title</th>
            <th className="px-3 py-2 font-medium text-slate-500">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {results.map((r) => (
            <tr key={r.row}>
              <td className="px-3 py-2 text-slate-400">{r.row}</td>
              <td className="px-3 py-2">{r.title || "—"}</td>
              <td className="px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[r.status]}`}>{LABEL[r.status]}</span>
                {r.reason && <span className="ml-2 text-xs text-slate-500">{r.reason}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BulkTaskImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "preview" | "commit">(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  function reset() {
    setPreview(null);
    setDone(null);
    setError(null);
  }

  async function send(mode: "preview" | "commit") {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an .xlsx or .csv file first.");
      return;
    }
    setBusy(mode);
    setError(null);
    if (mode === "commit") setDone(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      const res = await fetch("/api/tasks/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed. Check the file and try again.");
      } else if (mode === "preview") {
        setDone(null);
        setPreview(data as Preview);
      } else {
        setDone(data as Done);
        setPreview(null);
        if ((data.created ?? 0) > 0 || (data.updated ?? 0) > 0) router.refresh();
      }
    } catch {
      setError("Something went wrong uploading the file.");
    } finally {
      setBusy(null);
    }
  }

  const canCommit = preview && preview.willCreate + preview.willUpdate > 0;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Bulk import tasks from Excel</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Upload an <b>.xlsx</b> or <b>.csv</b>, <b>preview</b> exactly what will happen, then confirm.
            Columns: <b>Title</b>, Description, Assignee (name/email), Collaborators (comma-separated),
            Project, Parent (a TM-id or exact title → makes a subtask), Priority, Status
            (To&nbsp;Do/In&nbsp;Progress/In&nbsp;Review/Done), Start date, Due date, Estimate
            (<code>2h</code>/<code>1h 30m</code>), Recurrence (Daily/Weekly/Monthly), Tags
            (auto-created), Review required. Add a <b>TM-ID</b> column to <b>update</b> an existing task
            instead of creating one (blank cells are left unchanged).
          </p>
        </div>
        <a href="/api/tasks/import/template" className="btn-secondary !py-1.5 text-xs whitespace-nowrap">
          ⇩ Blank template
        </a>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="input max-w-xs text-sm"
          onChange={reset}
        />
        <button type="button" onClick={() => send("preview")} disabled={!!busy} className="btn-secondary disabled:opacity-50">
          {busy === "preview" ? "Checking…" : "Preview"}
        </button>
        {canCommit && (
          <button type="button" onClick={() => send("commit")} disabled={!!busy} className="btn-primary disabled:opacity-50">
            {busy === "commit"
              ? "Importing…"
              : `Confirm import (${preview!.willCreate + preview!.willUpdate})`}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {preview && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-700">{preview.willCreate} to create</span>
            <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-700">{preview.willUpdate} to update</span>
            {preview.willSkip > 0 && (
              <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">{preview.willSkip} skipped (already open)</span>
            )}
            <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700">{preview.failed} with errors</span>
            {preview.failed > 0 && (
              <span className="text-xs text-slate-500">Fix the flagged rows and Preview again — only valid rows import.</span>
            )}
          </div>
          <ResultTable results={preview.results} />
        </div>
      )}

      {done && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-700">{done.created} created</span>
            <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-700">{done.updated} updated</span>
            {done.skipped > 0 && (
              <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">{done.skipped} skipped (already open)</span>
            )}
            <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700">{done.failed} failed</span>
          </div>
          <ResultTable results={done.results} />
        </div>
      )}
    </div>
  );
}
