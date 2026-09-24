"use client";

import { useMemo, useState } from "react";

export type PanelItem = { id: number; name: string; mimeType: string; size: number; at: string };
export type PanelLink = { url: string; at: string };
export type PanelStarred = { id: number; body: string; senderId: number; at: string; hasAttachment: boolean };

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const TABS = ["media", "docs", "links", "starred"] as const;
type Tab = (typeof TABS)[number];

/**
 * Conversation info panel — media, shared docs, shared links, and your
 * starred messages, WhatsApp-style. Slides in over the right edge of the
 * thread (full-width on mobile). Built entirely from the message history
 * already loaded into ChatThread — no extra fetch.
 */
export default function ChatInfoPanel({
  media,
  docs,
  links,
  starred,
  meId,
  resolveSenderName,
  onJump,
  onClose,
}: {
  media: PanelItem[];
  docs: PanelItem[];
  links: PanelLink[];
  starred: PanelStarred[];
  meId: number;
  /** First name of the sender for a starred message that isn't yours — a
   *  single "other" person in a 1:1 thread, or a lookup by senderId in a
   *  group thread. */
  resolveSenderName: (senderId: number) => string;
  /** Close the panel and scroll the thread to this message. */
  onJump: (messageId: number) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(
    media.length ? "media" : docs.length ? "docs" : links.length ? "links" : "starred"
  );
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filteredMedia = useMemo(() => (q ? media.filter((m) => m.name.toLowerCase().includes(q)) : media), [media, q]);
  const filteredDocs = useMemo(() => (q ? docs.filter((d) => d.name.toLowerCase().includes(q)) : docs), [docs, q]);
  const filteredLinks = useMemo(() => (q ? links.filter((l) => l.url.toLowerCase().includes(q)) : links), [links, q]);
  const filteredStarred = useMemo(
    () => (q ? starred.filter((s) => s.body.toLowerCase().includes(q)) : starred),
    [starred, q]
  );

  const counts = { media: filteredMedia.length, docs: filteredDocs.length, links: filteredLinks.length, starred: filteredStarred.length };
  const totalUnfiltered = media.length + docs.length + links.length + starred.length;

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
        <h2 className="font-semibold">Conversation info</h2>
      </div>

      {totalUnfiltered > 0 && (
        <div className="border-b border-slate-200 p-2.5 dark:border-slate-700">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by file name, link or message"
            className="input !py-1.5 text-sm"
          />
        </div>
      )}

      <div className="flex border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => (
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
          (filteredMedia.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {q ? "No media matches your search." : "No media shared yet."}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {filteredMedia.map((m) => (
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
          (filteredDocs.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {q ? "No documents match your search." : "No documents shared yet."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {filteredDocs.map((d) => (
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
          (filteredLinks.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {q ? "No links match your search." : "No links shared yet."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {filteredLinks.map((l, i) => (
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

        {tab === "starred" &&
          (filteredStarred.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {q ? "No starred messages match your search." : "Star a message to find it here later."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {filteredStarred.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onJump(s.id)}
                  className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <span className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span className="text-amber-500">★</span>
                    {s.senderId === meId ? "You" : resolveSenderName(s.senderId).split(" ")[0]}
                    <span className="font-normal text-slate-400">· {dateLabel(s.at)}</span>
                  </span>
                  <span className="block truncate text-slate-700 dark:text-slate-200">
                    {s.body || (s.hasAttachment ? "📎 Attachment" : "")}
                  </span>
                </button>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
