"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type RowResult = { row: number; title: string; status: "created" | "skipped" | "error"; reason?: string };
type Report = { created: number; skipped: number; failed: number; results: RowResult[] };

const STATUS_STYLE: Record<RowResult["status"], string> = {
  created: "bg-green-100 text-green-700",
  skipped: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
};

export default function BulkTaskImport() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an .xlsx or .csv file first.");
      return;
    }
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/tasks/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Import failed. Check the file and try again.");
      else {
        setReport(data as Report);
        if (data.created > 0) router.refresh();
      }
    } catch {
      setError("Something went wrong uploading the file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Bulk import tasks from Excel</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Upload an <b>.xlsx</b> or <b>.csv</b> with columns: <b>Title</b> (required), Description,
            Assignee (name or email), Project, Priority (Low/Medium/High/Urgent), Status (To Do / In
            Progress / In Review / Done), Start date, Due date, Estimate (e.g. <code>2h</code> or{" "}
            <code>1h 30m</code>), Tags (comma-separated), Review required (yes/no). Unknown assignee or
            project rows are reported so you can fix them; new tags are created automatically.
            Assignees get an in-app heads-up (no email flood).
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
          onChange={() => {
            setError(null);
            setReport(null);
          }}
        />
        <button type="button" onClick={upload} disabled={busy} className="btn-primary disabled:opacity-50">
          {busy ? "Importing…" : "Import tasks"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {report && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-700">{report.created} created</span>
            <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700">{report.skipped} skipped</span>
            <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700">{report.failed} failed</span>
          </div>
          {report.results.length > 0 && (
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
                  {report.results.map((r) => (
                    <tr key={r.row}>
                      <td className="px-3 py-2 text-slate-400">{r.row}</td>
                      <td className="px-3 py-2">{r.title || "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                          {r.status}
                        </span>
                        {r.reason && <span className="ml-2 text-xs text-slate-500">{r.reason}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
