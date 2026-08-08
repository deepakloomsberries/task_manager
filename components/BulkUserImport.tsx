"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type RowResult = {
  row: number;
  name: string;
  email: string;
  status: "created" | "updated" | "skipped" | "error";
  reason?: string;
};

type Report = { created: number; updated: number; skipped: number; failed: number; results: RowResult[] };

const STATUS_STYLE: Record<RowResult["status"], string> = {
  created: "bg-green-100 text-green-700",
  updated: "bg-sky-100 text-sky-700",
  skipped: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
};

export default function BulkUserImport() {
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
      const res = await fetch("/api/users/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed. Please check the file and try again.");
      } else {
        setReport(data as Report);
        if (data.created > 0 || data.updated > 0) router.refresh(); // reflect changes in the table below
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
          <h2 className="font-semibold">Bulk import &amp; update from Excel</h2>
          <p className="mt-1 text-sm text-slate-500">
            Upload an <b>.xlsx</b> or <b>.csv</b> with columns: Name, Email, Role, Company, Department,
            Job Title, Requires Approval, Status, Password. Rows are matched by <b>email</b>: a new email
            creates a user, an existing one <b>updates</b> that person. Only Name, Email and Company are
            required. New users get a generated password (if blank) and a welcome email; leave Password
            blank on existing users to keep their current one. Set <b>Status</b> to Active/Inactive to
            enable or disable accounts.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <a href="/api/users/export" className="btn-secondary !py-1.5 text-xs whitespace-nowrap">
            ⇩ Download current users
          </a>
          <a href="/api/users/import/template" className="btn-secondary !py-1.5 text-xs whitespace-nowrap">
            ⇩ Blank template
          </a>
        </div>
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
          {busy ? "Importing…" : "Import users"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {report && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-700">
              {report.created} created
            </span>
            <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-700">
              {report.updated} updated
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700">
              {report.skipped} skipped
            </span>
            <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700">
              {report.failed} failed
            </span>
          </div>
          {report.results.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium text-slate-500">Row</th>
                    <th className="px-3 py-2 font-medium text-slate-500">Name</th>
                    <th className="px-3 py-2 font-medium text-slate-500">Email</th>
                    <th className="px-3 py-2 font-medium text-slate-500">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.results.map((r) => (
                    <tr key={r.row}>
                      <td className="px-3 py-2 text-slate-400">{r.row}</td>
                      <td className="px-3 py-2">{r.name || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{r.email || "—"}</td>
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
