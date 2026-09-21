"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { deleteAttachment } from "@/lib/actions/files";

export type NoteImage = { id: number; originalName: string };
export type NoteImagesHandle = { openPicker: () => void };

/**
 * Photo strip for a note, Keep-style: attached screenshots/images render as
 * large tiles rather than a boxed attachment list, and (when `editable`) more
 * can be added by choosing a file, dragging one in, or pasting a screenshot
 * straight from the clipboard (Ctrl/Cmd+V) while the note is open — mirrors
 * PasteAttachment.tsx's paste handling, scoped to a note instead of a task.
 * `openPicker` is exposed via ref so a toolbar icon elsewhere can trigger the
 * file picker without this component needing to render its own button.
 */
const NoteImages = forwardRef<NoteImagesHandle, { noteId: number; images: NoteImage[]; editable: boolean }>(
  function NoteImages({ noteId, images, editable }, ref) {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);

    useImperativeHandle(ref, () => ({ openPicker: () => fileRef.current?.click() }), []);

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

    const dragHandlers = editable
      ? {
          onDragOver: (e: React.DragEvent) => e.preventDefault(),
          onDragEnter: (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(true);
          },
          onDragLeave: () => setDragOver(false),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) upload(Array.from(e.dataTransfer.files));
          },
        }
      : {};

    if (!editable && images.length === 0) return null;

    return (
      <div>
        {images.length > 0 ? (
          <div
            {...dragHandlers}
            className={`grid gap-1 overflow-hidden rounded-lg ${
              images.length === 1 ? "grid-cols-1" : "grid-cols-2"
            } ${dragOver ? "ring-2 ring-sky-400" : ""}`}
          >
            {images.map((img) => (
              <div key={img.id} className="group/img relative">
                <a href={`/api/files/${img.id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/files/${img.id}`}
                    alt={img.originalName}
                    className={`w-full object-cover ${images.length === 1 ? "max-h-64" : "h-28"}`}
                  />
                </a>
                {editable && (
                  <form
                    action={deleteAttachment}
                    className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover/img:opacity-100"
                  >
                    <input type="hidden" name="id" value={img.id} />
                    <button
                      type="submit"
                      title="Remove photo"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
                    >
                      ✕
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        ) : editable ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            {...dragHandlers}
            className={`flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-xs text-slate-400 hover:text-slate-600 ${
              dragOver ? "ring-2 ring-sky-400" : ""
            }`}
          >
            <span>📷</span>
            <span>{uploading > 0 ? "Uploading…" : "Add a photo, or paste a screenshot"}</span>
          </button>
        ) : null}
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
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);

export default NoteImages;
