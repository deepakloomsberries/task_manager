"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { postDiscussionMessage, deleteDiscussionMessage } from "@/lib/actions/discussion";
import { initials, avatarColor } from "@/lib/ui";
import MentionTextarea, { type MentionPerson } from "@/components/MentionTextarea";
import { renderRich } from "@/components/RichText";
import ConfirmDialog from "@/components/ConfirmDialog";

type Att = { id: number; name: string; mimeType: string; size: number };

type Msg = {
  id: number;
  body: string;
  authorId: number;
  authorName: string;
  authorCompany: string;
  createdAt: string;
  attachments?: Att[];
  deleted?: boolean;
  pending?: boolean;
  failed?: boolean;
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const isImage = (a: Att) => a.mimeType.startsWith("image/");

function AttachmentList({ atts, mine }: { atts: Att[]; mine: boolean }) {
  if (!atts.length) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {atts.map((a) =>
        isImage(a) ? (
          <a key={a.id} href={`/api/files/${a.id}`} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${a.id}`} alt={a.name} className="max-h-60 max-w-full rounded-lg object-cover" />
          </a>
        ) : (
          <a
            key={a.id}
            href={`/api/files/${a.id}?download=1`}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
              mine ? "bg-sky-700/40" : "bg-white/70"
            }`}
          >
            <span className="text-base">📎</span>
            <span className="min-w-0">
              <span className="block max-w-[12rem] truncate font-medium">{a.name}</span>
              <span className="opacity-70">{fmtSize(a.size)}</span>
            </span>
          </a>
        )
      )}
    </div>
  );
}

export default function DiscussionThread({
  meId,
  isAdmin,
  initialMessages,
  users,
}: {
  meId: number;
  isAdmin: boolean;
  initialMessages: Msg[];
  users: MentionPerson[];
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [text, setText] = useState("");
  const [atts, setAtts] = useState<Att[]>([]);
  const [uploading, setUploading] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const atBottomRef = useRef(true);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useEffect(() => {
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mergeIncoming = useCallback((incoming: Msg[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      let changed = false;
      const pendings = prev.filter((m) => m.pending);
      for (const m of incoming) {
        if (byId.has(m.id)) continue;
        const twin = pendings.find((p) => p.authorId === m.authorId && p.body === m.body);
        if (twin) {
          byId.delete(twin.id);
          const idx = pendings.indexOf(twin);
          if (idx >= 0) pendings.splice(idx, 1);
        }
        byId.set(m.id, m);
        changed = true;
      }
      if (!changed) return prev;
      return Array.from(byId.values()).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id
      );
    });
  }, []);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      const realIds = messagesRef.current.filter((m) => m.id > 0).map((m) => m.id);
      const after = realIds.length ? Math.max(...realIds) : 0;
      try {
        const res = await fetch(`/api/discussion?after=${after}`, { cache: "no-store" });
        if (!res.ok || !active) return;
        const data = await res.json();
        mergeIncoming(data.messages as Msg[]);
        if (Array.isArray(data.deletedIds) && data.deletedIds.length) {
          const del = new Set<number>(data.deletedIds);
          setMessages((prev) =>
            prev.map((m) => (del.has(m.id) && !m.deleted ? { ...m, deleted: true, body: "", attachments: [] } : m))
          );
        }
      } catch {
        /* offline / transient — try again next tick */
      }
    };

    const id = setInterval(poll, 3000);
    const onVis = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [mergeIncoming]);

  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [messages, atts, scrollToBottom]);

  const uploadFiles = useCallback((files: File[]) => {
    for (const f of files) {
      if (!f || f.size === 0) continue;
      setUploading((u) => u + 1);
      const fd = new FormData();
      fd.append("file", f);
      fetch("/api/messages/upload", { method: "POST", body: fd })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("upload failed"))))
        .then((a: Att) => setAtts((prev) => (prev.length >= 10 ? prev : [...prev, a])))
        .catch(() => {})
        .finally(() => setUploading((u) => u - 1));
    }
  }, []);

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    // Excel/Sheets cells carry both an image and text — if there's text, paste
    // it as text rather than uploading the cell's bitmap.
    const text = e.clipboardData?.getData("text/plain");
    if (text && text.trim()) return;
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      uploadFiles(files);
    }
  };

  const sendBody = useCallback(
    async (body: string, sending: Att[]) => {
      if (!body && sending.length === 0) return;
      const tempId = -(Date.now() + Math.floor(Math.random() * 1000));
      const optimistic: Msg = {
        id: tempId,
        body,
        authorId: meId,
        authorName: "You",
        authorCompany: "",
        createdAt: new Date().toISOString(),
        attachments: sending,
        pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);
      atBottomRef.current = true;
      requestAnimationFrame(() => scrollToBottom(true));

      const res = await postDiscussionMessage(body, sending.map((a) => a.id));
      if ("error" in res) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
        return;
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.id)) return prev.filter((m) => m.id !== tempId);
        return prev.map((m) => (m.id === tempId ? { ...res } : m));
      });
    },
    [meId, scrollToBottom]
  );

  function submit() {
    const body = text.trim();
    if (!body && atts.length === 0) return;
    const sending = atts;
    setText("");
    setAtts([]);
    void sendBody(body, sending);
  }

  function onDelete(id: number) {
    setPendingDelete(id);
  }

  function confirmDelete() {
    const id = pendingDelete;
    setPendingDelete(null);
    if (id == null) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deleted: true, body: "", attachments: [] } : m)));
    void deleteDiscussionMessage(id);
  }

  const groups: { label: string; items: Msg[] }[] = [];
  for (const m of messages) {
    const label = dayLabel(m.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }

  const canSend = (!!text.trim() || atts.length > 0) && uploading === 0;

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="card flex-1 space-y-4 overflow-y-auto p-5"
      >
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">
            No messages yet. Start the conversation.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.label} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[11px] font-medium text-slate-500">
                {g.label}
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            {g.items.map((m) => {
              const mine = m.authorId === meId;
              const canDelete = !m.deleted && !m.pending && (mine || isAdmin);
              return (
                <div key={m.id} className={`group flex gap-3 ${mine ? "flex-row-reverse" : ""}`}>
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor(m.authorName)}`}
                  >
                    {initials(m.authorName)}
                  </div>
                  <div
                    className={`max-w-[75%] rounded-xl px-4 py-2.5 ${
                      m.deleted
                        ? "bg-slate-50 text-slate-400 ring-1 ring-slate-200"
                        : mine
                          ? "bg-sky-600 text-white"
                          : "bg-slate-100 text-slate-800"
                    } ${m.failed ? "ring-1 ring-red-300" : ""}`}
                  >
                    <div className="mb-0.5 flex items-baseline gap-2">
                      <span className={`text-xs font-semibold ${mine ? "text-sky-100" : "text-slate-600"}`}>
                        {mine ? "You" : `${m.authorName}${m.authorCompany ? ` · ${m.authorCompany}` : ""}`}
                      </span>
                      <span className={`text-[10px] ${mine ? "text-sky-200" : "text-slate-400"}`}>
                        {m.pending ? "sending…" : m.failed ? "failed" : timeLabel(m.createdAt)}
                      </span>
                    </div>
                    {m.deleted ? (
                      <p className="text-sm italic">This message was deleted</p>
                    ) : (
                      <>
                        {m.body && (
                          <p className="whitespace-pre-wrap text-sm">{renderRich(m.body, users, { mine })}</p>
                        )}
                        <AttachmentList atts={m.attachments ?? []} mine={mine} />
                      </>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(m.id)}
                        className={`mt-1 block text-[10px] opacity-0 transition group-hover:opacity-100 ${
                          mine ? "text-sky-200 hover:text-white" : "text-slate-400 hover:text-red-600"
                        }`}
                      >
                        delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {atts.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {atts.map((a) => (
            <span key={a.id} className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs">
              <span>{isImage(a) ? "🖼️" : "📎"}</span>
              <span className="max-w-[10rem] truncate">{a.name}</span>
              <button
                type="button"
                onClick={() => setAtts((prev) => prev.filter((x) => x.id !== a.id))}
                className="text-slate-400 hover:text-red-600"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="card flex items-end gap-2 p-4">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            uploadFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn-secondary !px-3 self-end"
          title="Attach files or photos"
        >
          {uploading > 0 ? "…" : "📎"}
        </button>
        <MentionTextarea
          users={users}
          value={text}
          onChange={setText}
          onEnterSubmit={submit}
          onPaste={onPaste}
          rows={2}
          maxLength={4000}
          placeholder="Message the whole team…  Type @ to mention · paste a screenshot to attach"
          className="resize-none"
        />
        <button type="button" onClick={submit} disabled={!canSend} className="btn-primary self-end disabled:opacity-50">
          Send
        </button>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        message="Delete this message for everyone?"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
