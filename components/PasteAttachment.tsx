"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addAttachmentLink } from "@/lib/actions/files";

type UploadItem = {
  id: string;
  name: string;
  size: number;
  progress: number; // 0-100
  status: "uploading" | "done" | "error";
  error?: string;
  xhr?: XMLHttpRequest;
};

/** Drives one file's upload via XMLHttpRequest instead of fetch — fetch has
 *  no upload-progress API, so a server action (which is fetch under the
 *  hood) can't report percentage, only an XHR-backed request can. */
function uploadWithProgress(
  file: File,
  taskId: number | undefined,
  onProgress: (pct: number) => void,
  bindXhr: (xhr: XMLHttpRequest) => void
): Promise<{ id: number; originalName: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    bindXhr(xhr);
    xhr.open("POST", "/api/attachments/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { id?: number; originalName?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON response — fall through to the generic error below */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.id) {
        resolve({ id: body.id, originalName: body.originalName ?? file.name });
      } else {
        reject(new Error(body.error || `Upload failed (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error — check your connection and try again."));
    xhr.onabort = () => reject(new Error("Cancelled"));
    const fd = new FormData();
    fd.append("file", file);
    if (taskId) fd.append("taskId", String(taskId));
    xhr.send(fd);
  });
}

/**
 * Lets people attach a file the normal way, drag-and-drop it onto this box,
 * paste a screenshot directly (Ctrl/Cmd+V) — including while writing a
 * comment — or attach a link instead, for something too large to upload (a
 * designer's 100-500 MB source file, say). Uploads show live progress in a
 * small popup instead of a static "Uploading…" label.
 */
export default function PasteAttachment({
  taskId,
  listenPaste = true,
  compact = false,
  shareAfterUpload = false,
}: {
  taskId?: number;
  listenPaste?: boolean;
  compact?: boolean;
  /** Documents page: after uploading one file, open its Share dialog. */
  shareAfterUpload?: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const dragCounter = useRef(0);

  const patchUpload = useCallback((id: string, patch: Partial<UploadItem>) => {
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  function submitFiles(files: File[]) {
    if (files.length === 0) return;
    const items: UploadItem[] = files.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      progress: 0,
      status: "uploading",
    }));
    setUploads((prev) => [...prev, ...items]);

    let anySucceeded = false;
    let lastId: number | null = null;
    Promise.allSettled(
      files.map((file, i) => {
        const item = items[i];
        return uploadWithProgress(
          file,
          taskId,
          (pct) => patchUpload(item.id, { progress: pct }),
          (xhr) => patchUpload(item.id, { xhr })
        )
          .then((res) => {
            anySucceeded = true;
            lastId = res.id;
            patchUpload(item.id, { status: "done", progress: 100 });
            // Fade the success entry out of the popup on its own; errors stay
            // until dismissed so they're not missed.
            setTimeout(() => setUploads((prev) => prev.filter((u) => u.id !== item.id)), 2500);
          })
          .catch((err: Error) => {
            if (err.message !== "Cancelled") {
              patchUpload(item.id, { status: "error", error: err.message });
            } else {
              setUploads((prev) => prev.filter((u) => u.id !== item.id));
            }
          });
      })
    ).then(() => {
      // Refresh the server-rendered attachment list once this batch settles
      // (a plain fetch/XHR upload doesn't navigate, so nothing else would).
      if (!anySucceeded) return;
      if (shareAfterUpload && files.length === 1 && lastId) router.push(`/documents?share=${lastId}`);
      else router.refresh();
    });
  }

  function onChoose(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) submitFiles(Array.from(files));
    e.target.value = ""; // so choosing the same file again still fires onChange
  }

  function cancelUpload(item: UploadItem) {
    item.xhr?.abort();
  }

  function dismissError(id: string) {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }

  useEffect(() => {
    if (!listenPaste) return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      // Copying a cell from Excel/Sheets puts BOTH an image and the text on the
      // clipboard. If there's any text, treat this as a text paste (let it land
      // in the comment box) — only bare images (real screenshots) get attached.
      const text = e.clipboardData?.getData("text/plain");
      if (text && text.trim()) return;
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
            const named = new File([blob], `screenshot-${Date.now()}.${ext}`, {
              type: blob.type,
            });
            submitFiles([named]);
          }
          return;
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, listenPaste]);

  async function submitLink() {
    const url = linkUrl.trim();
    if (!url) return;
    setAddingLink(true);
    const fd = new FormData();
    if (taskId) fd.append("taskId", String(taskId));
    fd.append("url", url);
    fd.append("label", linkLabel.trim());
    try {
      await addAttachmentLink(fd);
      setLinkUrl("");
      setLinkLabel("");
      setShowLinkForm(false);
    } finally {
      setAddingLink(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOver(false);
    if (e.dataTransfer.files?.length) submitFiles(Array.from(e.dataTransfer.files));
  }

  return (
    <div
      className={`relative ${
        compact
          ? "flex flex-wrap items-center gap-2"
          : `flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-3 transition-colors ${
              dragOver
                ? "border-sky-400 bg-sky-50 dark:bg-sky-950/30"
                : "border-slate-300 bg-slate-50/60 dark:border-slate-600"
            }`
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => {
        e.preventDefault();
        dragCounter.current += 1;
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      <input ref={fileRef} type="file" multiple className="hidden" onChange={onChoose} />
      <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary !py-1.5 text-xs">
        📎 Attach file
      </button>
      <button
        type="button"
        onClick={() => setShowLinkForm((s) => !s)}
        className={`btn-secondary !py-1.5 text-xs ${showLinkForm ? "!border-sky-500 !text-sky-600" : ""}`}
      >
        🔗 Add link
      </button>
      <span className="hidden text-xs text-slate-500 sm:inline">
        …drop a file, or paste a screenshot with{" "}
        <kbd className="rounded border border-slate-300 bg-white px-1 dark:border-slate-600 dark:bg-slate-800">
          Ctrl/Cmd + V
        </kbd>
      </span>
      {!compact && <span className="ml-auto text-xs text-slate-400">Max 50 MB — bigger? Add a link instead.</span>}

      {showLinkForm && (
        <div className="flex w-full flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://drive.google.com/…"
            className="input min-w-[14rem] flex-1 !py-1.5 text-sm"
          />
          <input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="Label (optional)"
            className="input w-40 !py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => void submitLink()}
            disabled={!linkUrl.trim() || addingLink}
            className="btn-primary !py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            {addingLink ? "Adding…" : "Add"}
          </button>
        </div>
      )}

      {/* Upload progress popup — bottom-right of this box, above everything
          else on the page, like a Drive/Dropbox-style uploader. */}
      {uploads.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 w-72 space-y-2">
          {uploads.map((u) => (
            <div
              key={u.id}
              className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-600 dark:bg-slate-800"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{u.name}</span>
                {u.status === "uploading" && (
                  <>
                    <span className="shrink-0 text-xs text-slate-400">{u.progress}%</span>
                    <button
                      type="button"
                      onClick={() => cancelUpload(u)}
                      aria-label="Cancel upload"
                      className="shrink-0 rounded px-1 text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      ✕
                    </button>
                  </>
                )}
                {u.status === "done" && <span className="shrink-0 text-xs text-green-600">✓</span>}
                {u.status === "error" && (
                  <button
                    type="button"
                    onClick={() => dismissError(u.id)}
                    aria-label="Dismiss"
                    className="shrink-0 rounded px-1 text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    ✕
                  </button>
                )}
              </div>
              {u.status === "error" ? (
                <p className="mt-1 text-xs text-red-600">{u.error}</p>
              ) : (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                  <div
                    className={`h-full rounded-full transition-all ${u.status === "done" ? "bg-green-500" : "bg-sky-500"}`}
                    style={{ width: `${u.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
