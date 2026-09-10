"use client";

import { useState } from "react";

export type PanelItem = { id: number; name: string; mimeType: string; size: number; at: string };
export type PanelLink = { url: string; at: string };

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * WhatsApp-style "Media, links and docs" panel for a conversation. Slides in
 * over the right edge of the thread (full-width on mobile). Built entirely
 * from the message history already loaded into ChatThread — no extra fetch.
 */
export default function ChatInfoPanel({
  media,
  docs,
  links,
  onClose,
}: {
  media: PanelItem[];
  docs: PanelItem[];
  links: PanelLink[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"media" | "docs" | "links">(
    media.length ? "media" : docs.length ? "docs" : "links"
  );

  const counts = { media: media.length, docs: docs.length, links: links.length };

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-slate-200 bg-white shadow-xl sm:max-w-xs dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-700">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-1.5 py-1 text-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          aria-label="Close"
        >
          ✕
        </button>
        <h2 className="font-semibold">Media, links and docs</h2>
      </div>

      <div className="flex border-b border-slate-200 dark:border-slate-700">
        {(["media", "docs", "links"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 border-b-2 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t
                ? "border-sky-600 text-sky-600"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {t}
            {counts[t] > 0 && <span className="ml-1 text-slate-400">{counts[t]}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "media" &&
          (media.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No media shared yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {media.map((m) => (
                <a
                  key={m.id}
                  href={`/api/files/${m.id}`}
                  target="_blank"
                  rel="noreferrer"
                  title={m.name}
                  className="block aspect-square overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-700"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${m.id}`} alt={m.name} className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          ))}

        {tab === "docs" &&
          (docs.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No documents shared yet.</p>
          ) : (
            <div className="space-y-1.5">
              {docs.map((d) => (
                <a
                  key={d.id}
                  href={`/api/files/${d.id}?download=1`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <span className="text-lg">📎</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{d.name}</span>
                    <span className="text-xs text-slate-400">
                      {fmtSize(d.size)} · {dateLabel(d.at)}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          ))}

        {tab === "links" &&
          (links.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No links shared yet.</p>
          ) : (
            <div className="space-y-1.5">
              {links.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <span className="block truncate text-sky-600 underline dark:text-sky-400">{l.url}</span>
                  <span className="text-xs text-slate-400">{dateLabel(l.at)}</span>
                </a>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
