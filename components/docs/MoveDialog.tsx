"use client";

import { useEffect, useState, useTransition } from "react";
import Modal from "./Modal";
import { folderChoices, moveFiles, moveFolder } from "@/lib/actions/documents";

/** "Move to…" for files (several at once) or one folder. */
export default function MoveDialog({
  fileIds = [],
  folder,
  onClose,
}: {
  fileIds?: number[];
  folder?: { id: number; name: string };
  onClose: (changed: boolean) => void;
}) {
  const [choices, setChoices] = useState<{ id: number; path: string }[] | null>(null);
  const [target, setTarget] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    void folderChoices().then((c) => setChoices(folder ? c.filter((x) => x.id !== folder.id) : c));
  }, [folder]);
  const title = folder ? `Move folder “${folder.name}”` : `Move ${fileIds.length} file${fileIds.length === 1 ? "" : "s"}`;
  return (
    <Modal title={title} onClose={() => onClose(false)}>
      {!choices ? (
        <p className="py-6 text-center text-sm text-slate-400">Loading folders…</p>
      ) : (
        <div className="space-y-3">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="input" aria-label="Destination folder" size={Math.min(10, choices.length + 1)}>
            <option value="">📂 Documents (top level)</option>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                📁 {c.path}
              </option>
            ))}
          </select>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => onClose(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const to = target ? Number(target) : null;
                  const r = folder ? await moveFolder(folder.id, to) : await moveFiles(fileIds, to);
                  if (r.ok) onClose(true);
                  else setError(r.error);
                })
              }
              className="btn-primary"
            >
              Move here
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
