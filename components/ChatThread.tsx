"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import UserAvatar from "@/components/UserAvatar";
import ConfirmDialog from "@/components/ConfirmDialog";
import ChatInfoPanel, { type PanelItem, type PanelLink } from "@/components/ChatInfoPanel";
import { sendMessage, deleteMessage, toggleReaction } from "@/lib/actions/messages";
import { isOnline, lastSeenLabel } from "@/lib/ui";

type Att = { id: number; name: string; mimeType: string; size: number };
type ReplyRef = { id: number; body: string; senderId: number; hasAttachment: boolean };
type Reaction = { emoji: string; count: number; mine: boolean };

type Msg = {
  id: number;
  body: string;
  senderId: number;
  createdAt: string;
  attachments?: Att[];
  deleted?: boolean;
  pending?: boolean;
  failed?: boolean;
  replyTo?: ReplyRef | null;
  reactions?: Reaction[];
};

type Person = {
  id: number;
  name: string;
  jobTitle?: string | null;
  email: string;
  avatarPath?: string | null;
};

// A curated, WhatsApp-flavoured emoji set — broad enough to cover reactions
// and everyday chat without loading an emoji-data library just for this.
const EMOJI_PICKER = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😜", "🤔", "😐",
  "😴", "😢", "😭", "😡", "😱", "🥳", "🤗", "🤝", "🙏", "👍",
  "👎", "👏", "🙌", "💪", "👌", "✌️", "🤞", "🤟", "👋", "🖐️",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💯", "🔥",
  "✨", "🎉", "🎊", "✅", "❌", "⚠️", "❓", "❗", "⭐", "🌟",
  "☀️", "🌧️", "☕", "🍕", "🎂", "🎁", "📅", "⏰", "📌", "📎",
  "📊", "📈", "📉", "💻", "📱", "✉️", "📞", "🚀", "🏠", "🚗",
];

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

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

/** Renders message text with URLs linkified and, while a thread search is
 *  active, its matches wrapped in <mark> — so results are visible in place,
 *  not just jumped to. */
function renderBody(text: string, mine: boolean, query: string) {
  const urlParts = text.split(/(https?:\/\/[^\s]+)/g);
  const q = query.trim().toLowerCase();
  return urlParts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noreferrer"
          className={`underline ${mine ? "text-white" : "text-sky-600 dark:text-sky-400"}`}
        >
          {part}
        </a>
      );
    }
    if (!q) return <span key={i}>{part}</span>;
    const lower = part.toLowerCase();
    const pieces: React.ReactNode[] = [];
    let start = 0;
    let idx: number;
    let k = 0;
    while ((idx = lower.indexOf(q, start)) !== -1) {
      if (idx > start) pieces.push(part.slice(start, idx));
      pieces.push(
        <mark key={`${i}-${k++}`} className="rounded bg-amber-300 px-0.5 text-slate-900">
          {part.slice(idx, idx + q.length)}
        </mark>
      );
      start = idx + q.length;
    }
    if (start < part.length) pieces.push(part.slice(start));
    return <span key={i}>{pieces}</span>;
  });
}

function AttachmentList({ atts, mine }: { atts: Att[]; mine: boolean }) {
  if (!atts.length) return null;
  return (
    <div className="mt-1 flex flex-col gap-1">
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
              mine ? "bg-sky-700/40" : "bg-white/70 dark:bg-slate-800/70"
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

/** The reply/react (and, for your own messages, delete) icons that appear on
 *  hover next to a bubble — grouped so both sides of the conversation share
 *  the same three buttons instead of duplicating markup. */
function MessageActions({
  onReply,
  onReact,
  onDelete,
}: {
  onReply: () => void;
  onReact: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        type="button"
        onClick={onReact}
        title="React"
        aria-label="React"
        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
      >
        <span className="text-sm leading-none">🙂</span>
      </button>
      <button
        type="button"
        onClick={onReply}
        title="Reply"
        aria-label="Reply"
        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 17l-5-5 5-5M4 12h11a4 4 0 0 1 4 4v1" />
        </svg>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          title="Delete message"
          aria-label="Delete message"
          className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          </svg>
        </button>
      )}
    </div>
  );
}

function QuickReactBar({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1 py-0.5 shadow-sm dark:border-slate-600 dark:bg-slate-800">
      {QUICK_REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className="rounded-full p-1 text-base hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          {e}
        </button>
      ))}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="rounded-full p-1 text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
      >
        ✕
      </button>
    </div>
  );
}

export default function ChatThread({
  meId,
  other,
  initialMessages,
  initialLastReadMyId,
  initialPartnerLastSeenAt,
}: {
  meId: number;
  other: Person;
  initialMessages: Msg[];
  initialLastReadMyId: number;
  initialPartnerLastSeenAt: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [lastReadMyId, setLastReadMyId] = useState(initialLastReadMyId);
  const [partnerLastSeen, setPartnerLastSeen] = useState<string | null>(initialPartnerLastSeenAt);
  const [text, setText] = useState("");
  const [atts, setAtts] = useState<Att[]>([]);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [uploading, setUploading] = useState(0);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Msg | null>(null);
  const [reactingTo, setReactingTo] = useState<number | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [, forceTick] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiBoxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const atBottomRef = useRef(true);
  const lastTypingPing = useRef(0);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const messageEls = useRef<Map<number, HTMLDivElement>>(new Map());

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  const scrollToMessage = useCallback((id: number) => {
    const el = messageEls.current.get(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(id);
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1200);
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useEffect(() => {
    scrollToBottom();
    // The page already marked this partner's messages read server-side by
    // the time it rendered us — but the sidebar lives in a layout that
    // persists across this navigation, so its unread badge won't pick that
    // up on its own (layouts don't re-fetch just because a child page did).
    // Nudge it now instead of leaving it stale until the next AutoRefresh tick.
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the emoji popover on an outside click.
  useEffect(() => {
    if (!showEmoji) return;
    const onDown = (e: MouseEvent) => {
      if (emojiBoxRef.current && !emojiBoxRef.current.contains(e.target as Node)) setShowEmoji(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showEmoji]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const mergeIncoming = useCallback((incoming: Msg[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      let changed = false;
      const pendings = prev.filter((m) => m.pending);
      for (const m of incoming) {
        if (byId.has(m.id)) continue;
        const twin = pendings.find((p) => p.senderId === m.senderId && p.body === m.body);
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
        const res = await fetch(`/api/messages/${other.id}?after=${after}`, { cache: "no-store" });
        if (!res.ok || !active) return;
        const data = await res.json();
        mergeIncoming(data.messages as Msg[]);
        if (Array.isArray(data.deletedIds) && data.deletedIds.length) {
          const del = new Set<number>(data.deletedIds);
          setMessages((prev) =>
            prev.map((m) => (del.has(m.id) && !m.deleted ? { ...m, deleted: true, body: "", attachments: [] } : m))
          );
        }
        // Reaction changes can land on messages well before `after`, so this
        // is a full snapshot for the loaded window, not a delta.
        if (Array.isArray(data.allReactions) && data.allReactions.length) {
          const byId = new Map<number, Reaction[]>(data.allReactions.map((r: { messageId: number; reactions: Reaction[] }) => [r.messageId, r.reactions]));
          setMessages((prev) =>
            prev.map((m) => (byId.has(m.id) ? { ...m, reactions: byId.get(m.id) } : m.reactions?.length ? { ...m, reactions: [] } : m))
          );
        }
        setLastReadMyId((cur) => Math.max(cur, data.lastReadMyId ?? 0));
        setPartnerLastSeen(data.partnerLastSeenAt ?? null);
        setPartnerTyping(!!data.partnerTyping);
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
  }, [other.id, mergeIncoming]);

  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [messages, partnerTyping, atts, scrollToBottom]);

  const pingTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingPing.current < 2500) return;
    lastTypingPing.current = now;
    fetch(`/api/messages/${other.id}/typing`, { method: "POST", keepalive: true }).catch(() => {});
  }, [other.id]);

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

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

  // Shared optimistic send used by the composer and the "start video call" button.
  const sendBody = useCallback(
    async (body: string, sending: Att[] = [], replyToId?: number) => {
      if (!body && sending.length === 0) return;
      const tempId = -(Date.now() + Math.floor(Math.random() * 1000));
      const replySnapshot = replyToId ? messagesRef.current.find((m) => m.id === replyToId) : undefined;
      const optimistic: Msg = {
        id: tempId,
        body,
        senderId: meId,
        createdAt: new Date().toISOString(),
        attachments: sending,
        pending: true,
        replyTo: replySnapshot
          ? {
              id: replySnapshot.id,
              body: replySnapshot.body,
              senderId: replySnapshot.senderId,
              hasAttachment: !!replySnapshot.attachments?.length,
            }
          : null,
      };
      setMessages((prev) => [...prev, optimistic]);
      atBottomRef.current = true;
      requestAnimationFrame(() => scrollToBottom(true));

      const res = await sendMessage(other.id, body, sending.map((a) => a.id), replyToId ?? null);
      if ("error" in res) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
        return;
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.id)) return prev.filter((m) => m.id !== tempId);
        return prev.map((m) =>
          m.id === tempId
            ? {
                id: res.id,
                body: res.body,
                senderId: res.senderId,
                createdAt: res.createdAt,
                attachments: res.attachments,
                replyTo: res.replyTo,
              }
            : m
        );
      });
    },
    [meId, other.id, scrollToBottom]
  );

  function submit() {
    const body = text.trim();
    if (!body && atts.length === 0) return;
    const sending = atts;
    const replyId = replyingTo?.id;
    setText("");
    setAtts([]);
    setReplyingTo(null);
    void sendBody(body, sending, replyId);
  }

  function startCall() {
    // Random, ID-free room so the link can't be guessed from who's in the chat.
    const room = `lb-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 8)}`;
    const url = `${window.location.origin}/call/${room}`;
    void sendBody(`📹 I started a video call — join here: ${url}`);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function onDelete(id: number) {
    setPendingDelete(id);
  }

  function confirmDelete() {
    const id = pendingDelete;
    setPendingDelete(null);
    if (id == null) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deleted: true, body: "", attachments: [] } : m)));
    void deleteMessage(id);
  }

  const handleReact = useCallback(async (messageId: number, emoji: string) => {
    setReactingTo(null);
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const list = m.reactions ?? [];
        const mineExisting = list.find((r) => r.mine);
        const turningOff = mineExisting?.emoji === emoji;

        let next = list.map((r) => (r.mine ? { ...r, mine: false, count: r.count - 1 } : r)).filter((r) => r.count > 0);
        if (!turningOff) {
          const idx = next.findIndex((r) => r.emoji === emoji);
          next = idx >= 0
            ? next.map((r, i) => (i === idx ? { ...r, count: r.count + 1, mine: true } : r))
            : [...next, { emoji, count: 1, mine: true }];
        }
        return { ...m, reactions: next };
      })
    );
    const res = await toggleReaction(messageId, emoji);
    if (!("error" in res)) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: res.reactions } : m)));
    }
  }, []);

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    if (!el) {
      setText((t) => t + emoji);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const online = isOnline(partnerLastSeen);
  let lastMineKey: number | null = null;
  for (const m of messages) if (m.senderId === meId && !m.deleted) lastMineKey = m.id;

  const groups: { label: string; items: Msg[] }[] = [];
  for (const m of messages) {
    const label = dayLabel(m.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }

  const canSend = !!text.trim() || atts.length > 0;

  // In-thread search — plain text match over what's already loaded, oldest
  // to newest. Re-opening or editing the query jumps to the most recent hit
  // first (most likely to be what you're after), then ▲/▼ step through it.
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as number[];
    return messages.filter((m) => !m.deleted && m.body.toLowerCase().includes(q)).map((m) => m.id);
  }, [messages, searchQuery]);

  useEffect(() => {
    setSearchIndex(searchQuery.trim() ? Math.max(0, searchMatches.length - 1) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    if (searchMatches.length) scrollToMessage(searchMatches[searchIndex] ?? searchMatches[searchMatches.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchIndex, searchMatches.length]);

  function stepSearch(dir: 1 | -1) {
    if (!searchMatches.length) return;
    setSearchIndex((i) => (i + dir + searchMatches.length) % searchMatches.length);
  }

  function jumpToDate(dateStr: string) {
    if (!dateStr) return;
    const target = new Date(dateStr).getTime();
    const hit = messages.find((m) => !m.deleted && new Date(m.createdAt).getTime() >= target);
    const fallback = messages[messages.length - 1];
    const pick = hit ?? fallback;
    if (pick) scrollToMessage(pick.id);
  }

  // Everything for the "Media, links and docs" panel comes straight out of
  // the message history already loaded here (up to 500 messages, same as
  // the page that seeds this component) — no separate fetch needed.
  const { media, docs, links } = useMemo(() => {
    const media: PanelItem[] = [];
    const docs: PanelItem[] = [];
    const links: PanelLink[] = [];
    const urlRe = /https?:\/\/[^\s]+/g;
    for (const m of messages) {
      if (m.deleted || m.pending || m.failed) continue;
      for (const a of m.attachments ?? []) {
        const item: PanelItem = { id: a.id, name: a.name, mimeType: a.mimeType, size: a.size, at: m.createdAt };
        (isImage(a) ? media : docs).push(item);
      }
      const found = m.body.match(urlRe);
      if (found) for (const url of found) links.push({ url, at: m.createdAt });
    }
    // Messages are oldest-first; show newest-first, like WhatsApp's panel.
    return { media: media.reverse(), docs: docs.reverse(), links: links.reverse() };
  }, [messages]);

  return (
    <div
      className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-slate-50 dark:bg-slate-900/30"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        if (e.dataTransfer?.files?.length) {
          e.preventDefault();
          uploadFiles(Array.from(e.dataTransfer.files));
        }
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        {/* The sidebar is always visible on desktop, so "back" only makes sense on mobile. */}
        <Link
          href="/messages"
          className="rounded-lg px-1.5 py-1 text-lg text-slate-500 hover:bg-slate-100 md:hidden dark:hover:bg-slate-700"
        >
          ←
        </Link>
        <UserAvatar user={other} size={40} presence={partnerLastSeen} />
        <div className="min-w-0">
          <h1 className="truncate font-semibold leading-tight">{other.name}</h1>
          {partnerTyping ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400">
              <span className="flex gap-0.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500" style={{ animationDelay: "300ms" }} />
              </span>
              typing…
            </p>
          ) : (
            <p className={`flex items-center gap-1.5 text-xs ${online ? "text-green-600 dark:text-green-400" : "text-slate-500"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"}`} />
              {lastSeenLabel(partnerLastSeen)}
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSearchOpen((s) => !s);
              setSearchQuery("");
            }}
            title="Search in conversation"
            aria-label="Search in conversation"
            className={`flex h-9 w-9 items-center justify-center rounded-xl border text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700 ${
              searchOpen
                ? "border-sky-500 bg-sky-50 text-sky-600 dark:border-sky-500 dark:bg-sky-900/30 dark:text-sky-400"
                : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setShowInfo((s) => !s)}
            title="Media, links and docs"
            aria-label="Media, links and docs"
            className={`flex h-9 w-9 items-center justify-center rounded-xl border text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700 ${
              showInfo
                ? "border-sky-500 bg-sky-50 text-sky-600 dark:border-sky-500 dark:bg-sky-900/30 dark:text-sky-400"
                : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          </button>
          <button
            type="button"
            onClick={startCall}
            title="Start a video call"
            aria-label="Start a video call"
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m23 7-7 5 7 5V7Z" />
              <rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
            <span className="hidden sm:inline">Call</span>
          </button>
        </div>
      </div>

      {/* Search bar — text search with match navigation, plus jump-to-date. */}
      {searchOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-400">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") stepSearch(e.shiftKey ? -1 : 1);
              if (e.key === "Escape") setSearchOpen(false);
            }}
            placeholder="Search in this conversation"
            className="input min-w-[10rem] flex-1 !py-1.5 text-sm"
          />
          {searchQuery.trim() && (
            <span className="shrink-0 text-xs text-slate-400">
              {searchMatches.length ? `${searchIndex + 1}/${searchMatches.length}` : "0/0"}
            </span>
          )}
          <button
            type="button"
            onClick={() => stepSearch(-1)}
            disabled={!searchMatches.length}
            title="Previous match"
            aria-label="Previous match"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-700"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => stepSearch(1)}
            disabled={!searchMatches.length}
            title="Next match"
            aria-label="Next match"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-700"
          >
            ▼
          </button>
          <div className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-600" />
          <input
            type="date"
            title="Jump to date"
            aria-label="Jump to date"
            onChange={(e) => jumpToDate(e.target.value)}
            className="input shrink-0 !py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            aria-label="Close search"
            className="ml-auto shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* Message list */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">
            No messages yet. Say hello to {other.name.split(" ")[0]}.
          </p>
        )}
        {groups.map((g) => (
          <div key={g.label} className="space-y-2">
            <div className="sticky top-0 z-10 flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                {g.label}
              </span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>
            {g.items.map((m) => {
              const mine = m.senderId === meId;
              if (m.deleted) {
                return (
                  <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                    {!mine && <UserAvatar user={other} size={26} />}
                    <div className="rounded-2xl bg-slate-100 px-3.5 py-2 text-sm italic text-slate-400 dark:bg-slate-700/50">
                      🚫 This message was deleted
                    </div>
                  </div>
                );
              }
              const isLastMine = mine && m.id === lastMineKey;
              const actions = (
                <div key={`actions-${m.id}`}>
                  {reactingTo === m.id ? (
                    <QuickReactBar onPick={(e) => void handleReact(m.id, e)} onClose={() => setReactingTo(null)} />
                  ) : (
                    <MessageActions
                      onReply={() => setReplyingTo(m)}
                      onReact={() => setReactingTo(m.id)}
                      onDelete={mine && !m.pending ? () => onDelete(m.id) : undefined}
                    />
                  )}
                </div>
              );
              return (
                <div key={m.id} className={`group flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine && <UserAvatar user={other} size={26} className="mb-4" />}
                  {mine && actions}
                  <div className={mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
                    <div
                      ref={(el) => {
                        if (el) messageEls.current.set(m.id, el);
                        else messageEls.current.delete(m.id);
                      }}
                      className={`max-w-[78vw] break-words rounded-2xl px-3.5 py-2 shadow-sm transition-shadow sm:max-w-md ${
                        mine
                          ? `rounded-br-md bg-sky-600 text-white ${m.failed ? "!bg-red-500" : ""} ${m.pending ? "opacity-70" : ""}`
                          : "rounded-bl-md bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                      } ${flashId === m.id ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900" : ""}`}
                    >
                      {m.replyTo && (
                        <button
                          type="button"
                          onClick={() => scrollToMessage(m.replyTo!.id)}
                          className={`mb-1.5 block w-full rounded-lg border-l-4 px-2 py-1 text-left text-xs ${
                            mine
                              ? "border-white/60 bg-white/10 text-white/90"
                              : "border-sky-400 bg-slate-200/70 text-slate-600 dark:bg-slate-600/40 dark:text-slate-200"
                          }`}
                        >
                          <span className="block font-semibold">
                            {m.replyTo.senderId === meId ? "You" : other.name.split(" ")[0]}
                          </span>
                          <span className="block truncate">
                            {m.replyTo.body || (m.replyTo.hasAttachment ? "📎 Attachment" : "")}
                          </span>
                        </button>
                      )}
                      {m.body && <p className="whitespace-pre-wrap text-sm">{renderBody(m.body, mine, searchOpen ? searchQuery : "")}</p>}
                      <AttachmentList atts={m.attachments ?? []} mine={mine} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-slate-400">
                      <span>{timeLabel(m.createdAt)}</span>
                      {isLastMine && (
                        <span>
                          {m.failed
                            ? "· failed"
                            : m.pending
                              ? "· sending…"
                              : m.id <= lastReadMyId
                                ? "· Seen"
                                : "· Delivered"}
                        </span>
                      )}
                    </div>
                    {!!m.reactions?.length && (
                      <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`}>
                        {m.reactions.map((r) => (
                          <button
                            key={r.emoji}
                            type="button"
                            onClick={() => void handleReact(m.id, r.emoji)}
                            className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
                              r.mine
                                ? "border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-900/30"
                                : "border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800"
                            }`}
                          >
                            <span>{r.emoji}</span>
                            {r.count > 1 && <span className="text-slate-500">{r.count}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!mine && actions}
                </div>
              );
            })}
          </div>
        ))}

        {partnerTyping && (
          <div className="flex items-end gap-2">
            <UserAvatar user={other} size={26} />
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 dark:bg-slate-700">
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "150ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800">
        {replyingTo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border-l-4 border-sky-500 bg-slate-100 px-3 py-1.5 text-xs dark:bg-slate-700">
            <div className="min-w-0 flex-1">
              <span className="block font-semibold text-sky-700 dark:text-sky-400">
                Replying to {replyingTo.senderId === meId ? "yourself" : other.name.split(" ")[0]}
              </span>
              <span className="block truncate text-slate-500 dark:text-slate-300">
                {replyingTo.body || (replyingTo.attachments?.length ? "📎 Attachment" : "")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              aria-label="Cancel reply"
              className="shrink-0 rounded-lg px-1.5 py-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              ✕
            </button>
          </div>
        )}
        {(atts.length > 0 || uploading > 0) && (
          <div className="mb-2 flex flex-wrap gap-2 border-b border-slate-100 pb-2 dark:border-slate-700">
            {atts.map((a) => (
              <div key={a.id} className="relative">
                {isImage(a) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${a.id}`} alt={a.name} className="h-16 w-16 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-16 w-32 items-center gap-1.5 rounded-lg bg-slate-100 px-2 text-[11px] dark:bg-slate-700">
                    <span>📎</span>
                    <span className="truncate">{a.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setAtts((prev) => prev.filter((x) => x.id !== a.id))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-xs text-white shadow"
                  aria-label="Remove attachment"
                >
                  ✕
                </button>
              </div>
            ))}
            {uploading > 0 && (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-[11px] text-slate-400 dark:bg-slate-700">
                Uploading…
              </div>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Attach a file"
            className="btn-secondary shrink-0 !rounded-xl !px-3"
            aria-label="Attach a file"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <div ref={emojiBoxRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowEmoji((s) => !s)}
              title="Emoji"
              aria-label="Emoji"
              className={`btn-secondary !rounded-xl !px-3 ${showEmoji ? "!border-sky-500 !bg-sky-50 !text-sky-600 dark:!bg-sky-900/30" : ""}`}
            >
              <span className="text-base leading-none">🙂</span>
            </button>
            {showEmoji && (
              <div className="absolute bottom-full left-0 z-30 mb-2 max-h-56 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-600 dark:bg-slate-800">
                <div className="grid grid-cols-8 gap-1">
                  {EMOJI_PICKER.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => insertEmoji(e)}
                      className="rounded-lg p-1 text-xl hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value.trim()) pingTyping();
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            rows={1}
            maxLength={4000}
            placeholder={`Message ${other.name.split(" ")[0]}… (paste a screenshot too)`}
            className="input max-h-40 flex-1 resize-none !py-2.5"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="btn-primary shrink-0 !rounded-xl disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </div>
      </div>

      {showInfo && <ChatInfoPanel media={media} docs={docs} links={links} onClose={() => setShowInfo(false)} />}

      <ConfirmDialog
        open={pendingDelete !== null}
        message="Delete this message for everyone?"
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
