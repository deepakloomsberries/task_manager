"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Modal from "./Modal";
import { listVersions, restoreVersion } from "@/lib/actions/documents";

type Data = Awaited<ReturnType<typeof listVersions>>;
const size = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Versions: upload a new version (same links and sharing) or bring an old one back. */
export default function VersionsDialog({ fileId, name, onClose }: { fileId: number; name: string; onClose: (changed: boolean) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const load = () => void listVersions(fileId).then(setData);
  useEffect(load, [fileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = (file: File) =>
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/documents/${fileId}/version`, { method: "POST", body: fd });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return setError(body.error ?? "Upload failed.");
      setChanged(true);
      load();
    });

  return (
    <Modal title={`Versions of “${name}”`} onClose={() => onClose(changed)}>
      {!data ? (
        <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
      ) : !data.ok ? (
        <p className="text-sm text-red-600">{data.error}</p>
      ) : (
        <div className="space-y-4">
          {data.canManage && (
            <div className="rounded-lg border border-dashed border-slate-300 p-3 text-sm dark:border-slate-600">
              <p className="mb-2 text-slate-600 dark:text-slate-300">
                Upload a new version — links you already sent (and all sharing) stay the same and give the new file.
              </p>
              <input ref={input} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              <button type="button" disabled={pending} onClick={() => input.current?.click()} className="btn-primary text-sm">
                {pending ? "Uploading…" : "⬆ Upload new version"}
              </button>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-700">
            <li className="flex items-center gap-3 py-2">
              <span className="badge bg-green-100 text-green-700">Current</span>
              <span className="min-w-0 flex-1 truncate">{data.current.name}</span>
              <span className="text-xs text-slate-400">
                {size(data.current.size)} · {when(data.current.at)} · {data.current.by}
              </span>
            </li>
            {data.versions.map((v) => (
              <li key={v.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate">{v.name}</span>
                <span className="text-xs text-slate-400">
                  {size(v.size)} · {when(v.at)} · {v.by}
                </span>
                {data.canManage && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await restoreVersion(fileId, v.id);
                        if (!r.ok) return setError(r.error);
                        setChanged(true);
                        load();
                      })
                    }
                    className="text-xs text-sky-700 hover:underline"
                  >
                    Restore
                  </button>
                )}
              </li>
            ))}
            {data.versions.length === 0 && <li className="py-2 text-xs text-slate-400">No earlier versions yet.</li>}
          </ul>
        </div>
      )}
    </Modal>
  );
}
