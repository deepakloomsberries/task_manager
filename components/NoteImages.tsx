"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAttachment } from "@/lib/actions/files";

export type NoteImage = { id: number; originalName: string };

/**
 * Photo strip for a note: shows attached screenshots/images as thumbnails and
 * (when `editable`) lets you add more by choosing a file, dragging one in, or
 * pasting a screenshot straight from the clipboard (Ctrl/Cmd+V) while the note
 * is open — mirrors PasteAttachment.tsx's paste handling, scoped to a note
 * instead of a task.
 */
export default function NoteImages({
  noteId,
  images,
  editable,
}: {
  noteId: number;
  images: NoteImage[];
  editable: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const upload = useCallback(
    (files: File[]) => {
      const imgFiles = files.filter((f) => f.type.startsWith("image/"));
      if (imgFiles.length === 0) return;
      setError(null);
      setUploading((n) => n + imgFiles.length);
      Promise.allSettled(
        imgFiles.map((file) => {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("noteId", String(noteId));
          return fetch("/api/attachments/upload", { method: "POST", body: fd }).then(async (res) => {
            if (!res.ok) {
              const body = await res.json().catch(() => ({}) as { error?: string });
              throw new Error(body.error || "Upload failed.");
            }
          });
        })
      ).then((results) => {
        setUploading((n) => n - imgFiles.length);
        const failed = results.find((r) => r.status === "rejected") as
          | PromiseRejectedResult
          | undefined;
        if (failed) setError((failed.reason as Error).message);
        router.refresh();
      });
    },
    [noteId, router]
  );

  useEffect(() => {
    if (!editable) return;
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      // Copying a cell from Excel/Sheets puts BOTH an image and text on the
      // clipboard — only bare images (real screenshots) get attached here.
      const text = e.clipboardData?.getData("text/plain");
      if (text && text.trim()) return;
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
            upload([new File([blob], `screenshot-${Date.now()}.${ext}`, { type: blob.type })]);
          }
          return;
        }
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [editable, upload]);

  if (!editable && images.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div
        className={`flex flex-wrap gap-2 rounded-md ${dragOver ? "ring-2 ring-sky-400" : ""}`}
        onDragOver={editable ? (e) => e.preventDefault() : undefined}
        onDragEnter={editable ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
        onDragLeave={editable ? () => setDragOver(false) : undefined}
        onDrop={
          editable
            ? (e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length) upload(Array.from(e.dataTransfer.files));
              }
            : undefined
        }
      >
        {images.map((img) => (
          <div
            key={img.id}
            className="group/img relative h-20 w-20 overflow-hidden rounded-md border border-black/10"
          >
            <a href={`/api/files/${img.id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/files/${img.id}`}
                alt={img.originalName}
                className="h-full w-full object-cover"
              />
            </a>
            {editable && (
              <form
                action={deleteAttachment}
                className="absolute right-0.5 top-0.5 opacity-0 transition-opacity group-hover/img:opacity-100"
              >
                <input type="hidden" name="id" value={img.id} />
                <button
                  type="submit"
                  title="Remove photo"
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
                >
                  ✕
                </button>
              </form>
            )}
          </div>
        ))}
        {editable && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-500"
            title="Add a photo, or paste a screenshot with Ctrl/Cmd+V"
          >
            <span className="text-lg">📷</span>
            <span className="text-[10px]">{uploading > 0 ? "Uploading…" : "Add photo"}</span>
          </button>
        )}
      </div>
      {editable && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) upload(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
