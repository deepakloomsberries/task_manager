"use client";

import { useEffect } from "react";
import { KIND_META, PREVIEWABLE, type FileKind } from "@/lib/fileKinds";

export type PreviewItem = { id: number; name: string; kind: FileKind; isLink: boolean; url: string | null; sizeLabel: string; uploader: string };

/**
 * Look at a file without downloading it: images, PDFs, videos, audio and text
 * open right here. ← / → go to the previous / next file, Esc closes.
 */
export default function PreviewModal({ items, index, onIndex, onClose }: { items: PreviewItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const item = items[index];
  const prev = index > 0 ? index - 1 : null;
  const next = index < items.length - 1 ? index + 1 : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && prev !== null) onIndex(prev);
      if (e.key === "ArrowRight" && next !== null) onIndex(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, onClose, onIndex]);

  if (!item) return null;
  const src = `/api/files/${item.id}`;
  const canPreview = !item.isLink && PREVIEWABLE.includes(item.kind);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/90" role="dialog" aria-modal="true" aria-label={`Preview ${item.name}`}>
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <span className="text-xl">{KIND_META[item.kind].icon}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{item.name}</div>
          <div className="text-xs text-slate-400">
            {item.sizeLabel} · {item.uploader} · {index + 1} of {items.length}
          </div>
        </div>
        {item.isLink ? (
          <a href={item.url ?? "#"} target="_blank" rel="noreferrer" className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
            Open link ↗
          </a>
        ) : (
          <>
            <a href={src} target="_blank" rel="noreferrer" className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
              Open in new tab ↗
            </a>
            <a href={`${src}?download=1`} className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm hover:bg-sky-500">
              ⬇ Download
            </a>
          </>
        )}
        <button type="button" onClick={onClose} aria-label="Close preview" className="rounded-lg px-2 py-1 text-xl hover:bg-white/10">
          ✕
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-6" onClick={onClose}>
        {prev !== null && (
          <button
            type="button"
            aria-label="Previous file"
            onClick={(e) => {
              e.stopPropagation();
              onIndex(prev);
            }}
            className="absolute left-3 rounded-full bg-white/10 px-3 py-2 text-2xl text-white hover:bg-white/20"
          >
            ‹
          </button>
        )}
        <div className="flex h-full w-full max-w-6xl items-center justify-center" onClick={(e) => e.stopPropagation()}>
          {!canPreview ? (
            <div className="rounded-2xl bg-white/5 p-10 text-center text-white">
              <div className="mb-3 text-6xl">{KIND_META[item.kind].icon}</div>
              <p className="mb-1 font-medium">{item.isLink ? "This is a link to another site." : "No preview for this type of file."}</p>
              <p className="text-sm text-slate-400">{item.isLink ? "Use “Open link” above." : "Download it to open it on your computer."}</p>
            </div>
          ) : item.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={item.id} src={src} alt={item.name} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
          ) : item.kind === "video" ? (
            <video key={item.id} src={src} controls autoPlay className="max-h-full max-w-full rounded-lg" />
          ) : item.kind === "audio" ? (
            <audio key={item.id} src={src} controls autoPlay className="w-full max-w-lg" />
          ) : (
            <iframe key={item.id} src={src} title={item.name} className="h-full w-full rounded-lg bg-white" />
          )}
        </div>
        {next !== null && (
          <button
            type="button"
            aria-label="Next file"
            onClick={(e) => {
              e.stopPropagation();
              onIndex(next);
            }}
            className="absolute right-3 rounded-full bg-white/10 px-3 py-2 text-2xl text-white hover:bg-white/20"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}
