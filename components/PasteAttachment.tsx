"use client";

import { useEffect, useRef, useState } from "react";
import { uploadAttachment, addAttachmentLink } from "@/lib/actions/files";

/**
 * Lets people attach a file the normal way, paste a screenshot directly
 * (Ctrl/Cmd+V) anywhere on the task page — including while writing a comment
 * — or attach a link instead, for something too large to upload (a
 * designer's 100-500 MB source file, say).
 */
export default function PasteAttachment({
  taskId,
  listenPaste = true,
  compact = false,
}: {
  taskId: number;
  listenPaste?: boolean;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [addingLink, setAddingLink] = useState(false);

  async function submitFiles(files: File[]) {
    if (files.length === 0) return;
    setPendingName(files.length === 1 ? files[0].name : `${files.length} files`);
    const fd = new FormData();
    fd.append("taskId", String(taskId));
    for (const f of files) fd.append("file", f);
    try {
      await uploadAttachment(fd);
    } finally {
      // uploadAttachment always redirects back to this same page (on both
      // success and failure), so this component never remounts — clear the
      // indicator ourselves instead of leaving "Uploading…" stuck forever.
      setPendingName(null);
    }
  }

  function onChoose(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) void submitFiles(Array.from(files));
    e.target.value = ""; // so choosing the same file again still fires onChange
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
            void submitFiles([named]);
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
    fd.append("taskId", String(taskId));
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

  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-center gap-2"
          : "mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3 dark:border-slate-600"
      }
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
      <span className="text-xs text-slate-500">
        …or paste a screenshot with{" "}
        <kbd className="rounded border border-slate-300 bg-white px-1 dark:border-slate-600 dark:bg-slate-800">
          Ctrl/Cmd + V
        </kbd>
      </span>
      {pendingName && <span className="text-xs text-sky-600">Uploading {pendingName}…</span>}
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
    </div>
  );
}
