"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Modal from "./Modal";
import UserAvatar from "@/components/UserAvatar";
import { getFolderShareInfo, setFolderAccess, shareFolderWith, unshareFolder, type FolderShareInfo } from "@/lib/actions/documents";

/** Share a folder — everything inside (files and sub-folders) follows it. */
export default function FolderShareDialog({ folderId, onClose }: { folderId: number; onClose: (changed: boolean) => void }) {
  const [info, setInfo] = useState<FolderShareInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [changed, setChanged] = useState(false);
  const [pending, start] = useTransition();
  const reload = () => void getFolderShareInfo(folderId).then((r) => (r.ok ? setInfo(r.info) : setError(r.error)));
  useEffect(reload, [folderId]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = (p: Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await p;
      if (!r.ok) return setError(r.error ?? "Something went wrong.");
      setChanged(true);
      reload();
    });
  const matches = useMemo(() => {
    if (!info || !q.trim()) return [];
    const have = new Set(info.people.map((p) => p.id));
    return info.directory.filter((p) => !have.has(p.id) && p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6);
  }, [info, q]);

  return (
    <Modal title={`Share folder “${info?.name ?? "…"}”`} onClose={() => onClose(changed)}>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!info ? (
        !error && <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-slate-500">Everything inside this folder — files and sub-folders — is shared the same way.</p>
          {info.canManage && (
            <div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add people" className="input" aria-label="Add people to folder" autoFocus />
              {matches.length > 0 && (
                <ul className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  {matches.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setQ("");
                          run(shareFolderWith(info.id, [p.id]));
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <UserAvatar user={p} size={28} />
                        <span className="flex-1">{p.name}</span>
                        <span className="text-xs text-sky-700">Add</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div>
            <h3 className="mb-2 text-sm font-semibold">People with access</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">👤</span>
                <span className="flex-1">{info.owner}</span>
                <span className="text-xs text-slate-400">Owner</span>
              </li>
              {info.people.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <UserAvatar user={p} size={32} />
                  <span className="flex-1">{p.name}</span>
                  {info.canManage && (
                    <button type="button" disabled={pending} onClick={() => run(unshareFolder(info.id, p.id))} className="text-xs text-red-600 hover:underline">
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">General access</h3>
            {info.canManage ? (
              <select value={info.access} disabled={pending} onChange={(e) => run(setFolderAccess(info.id, e.target.value))} className="input !w-auto" aria-label="Folder access">
                <option value="RESTRICTED">🔒 Restricted — only you and the people added</option>
                <option value="COMPANY">🏢 Looms &amp; Berries — everyone in the company</option>
              </select>
            ) : (
              <p className="text-sm">{info.access === "RESTRICTED" ? "🔒 Restricted" : "🏢 Looms & Berries"}</p>
            )}
            <p className="mt-1 text-xs text-slate-500">Want a public link? Select files and use “Share as one link”.</p>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={() => onClose(changed)} className="btn-primary px-6">
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
