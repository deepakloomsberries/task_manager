"use client";

import { useEffect, useRef, useState } from "react";
import { uploadAttachment } from "@/lib/actions/files";

/**
 * Lets people attach a file the normal way *or* paste a screenshot directly
 * (Ctrl/Cmd+V) anywhere on the task page — including while writing a comment.
 * Pasted images are submitted through the same server action as a chosen file,
 * so the redirect/refresh behaviour is handled natively by the form.
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
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);

  function submitWithFile(file: File) {
    if (!fileRef.current || !formRef.current) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    fileRef.current.files = dt.files;
    setPendingName(file.name);
    formRef.current.requestSubmit();
  }

  function onChoose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setPendingName(file.name);
      formRef.current?.requestSubmit();
    }
  }

  useEffect(() => {
    if (!listenPaste) return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
            const named = new File([blob], `screenshot-${Date.now()}.${ext}`, {
              type: blob.type,
            });
            submitWithFile(named);
          }
          return;
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, listenPaste]);

  return (
    <form
      ref={formRef}
      action={uploadAttachment}
      className={
        compact
          ? "flex flex-wrap items-center gap-2"
          : "mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3 dark:border-slate-600"
      }
    >
      <input type="hidden" name="taskId" value={taskId} />
      <input
        ref={fileRef}
        type="file"
        name="file"
        required
        className="hidden"
        onChange={onChoose}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="btn-secondary !py-1.5 text-xs"
      >
        📎 Attach file
      </button>
      <span className="text-xs text-slate-500">
        …or paste a screenshot with{" "}
        <kbd className="rounded border border-slate-300 bg-white px-1 dark:border-slate-600 dark:bg-slate-800">
          Ctrl/Cmd + V
        </kbd>
      </span>
      {pendingName && <span className="text-xs text-sky-600">Uploading {pendingName}…</span>}
      {!compact && <span className="ml-auto text-xs text-slate-400">Max 20 MB.</span>}
    </form>
  );
}
