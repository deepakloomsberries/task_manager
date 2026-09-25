"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import UserAvatar from "@/components/UserAvatar";
import ConfirmDialog from "@/components/ConfirmDialog";
import DatePicker from "@/components/DatePicker";
import ChatInfoPanel, { type PanelItem, type PanelLink, type PanelStarred } from "@/components/ChatInfoPanel";
import GroupMembersPanel from "@/components/GroupMembersPanel";
import { sendGroupMessage, deleteGroupMessage, toggleGroupReaction, toggleGroupStar } from "@/lib/actions/groups";

type Att = { id: number; name: string; mimeType: string; size: number };
type ReplyRef = { id: number; body: string; senderId: number; hasAttachment: boolean };
type Reaction = { emoji: string; count: number; mine: boolean };
type Person = { id: number; name: string; jobTitle?: string | null; avatarPath?: string | null };

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
  starred?: boolean;
};

// Same curated set as ChatThread's composer, kept identical on purpose —
// group and 1:1 chat should feel like the same app.
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

// Text colour for a sender's name above their bubble — WhatsApp-group style,
// stable per person via a name hash (same idea as UserAvatar's avatarColor,
// but a text-only palette that reads on the light bubble background).
const SENDER_NAME_COLORS = [
  "text-sky-600 dark:text-sky-400",
  "text-emerald-600 dark:text-emerald-400",
  "text-violet-600 dark:text-violet-400",
  "text-amber-600 dark:text-amber-400",
  "text-rose-600 dark:text-rose-400",
  "text-cyan-600 dark:text-cyan-400",
  "text-fuchsia-600 dark:text-fuchsia-400",
  "text-lime-700 dark:text-lime-400",
];
function senderNameColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return SENDER_NAME_COLORS[Math.abs(hash) % SENDER_NAME_COLORS.length];
}
const GROUP_COLORS = [
  "bg-sky-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-fuchsia-500", "bg-lime-600",
];
function groupColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
}

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

function renderBody(text: string, mine: boolean, query: string) {
  const urlParts = text.split(/(https?:\/\/[^\s]+)/g);
  const q = query.trim().toLowerCase();
  return urlParts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a key={i} href={part} target="_blank" rel="noreferrer" className={`underline ${mine ? "text-white" : "text-sky-600 dark:text-sky-400"}`}>
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
            className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${mine ? "bg-sky-700/40" : "bg-white/70 dark:bg-slate-800/70"}`}
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

function MessageActions({
  onReply,
  onReact,
  onStar,
  starred,
  onDelete,
}: {
  onReply: () => void;
  onReact: () => void;
  onStar: () => void;
  starred?: boolean;
  onDelete?: () => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      <button type="button" onClick={onReact} title="React" aria-label="React" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700">
        <span className="text-sm leading-none">🙂</span>
      </button>
      <button type="button" onClick={onReply} title="Reply" aria-label="Reply" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 17l-5-5 5-5M4 12h11a4 4 0 0 1 4 4v1" />
        </svg>
      </button>
      <button type="button" onClick={onStar} title={starred ? "Unstar message" : "Star message"} aria-label={starred ? "Unstar message" : "Star message"} className={`rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-slate-700 ${starred ? "text-amber-500" : "text-slate-400 hover:text-slate-600"}`}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill={starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6-5.9-3.3-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8Z" />
        </svg>
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete} title="Delete message" aria-label="Delete message" className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30">
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
        <button key={e} type="button" onClick={() => onPick(e)} className="rounded-full p-1 text-base hover:bg-slate-100 dark:hover:bg-slate-700">
          {e}
        </button>
      ))}
      <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-xs text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
        ✕
      </button>
    </div>
  );
}

export default function GroupChatThread({
  meId,
  group,
  initialMembers,
  initialMessages,
  allUsers,
}: {
  meId: number;
  group: { id: number; name: string };
  initialMembers: Person[];
  initialMessages: Msg[];
  /** Whole company directory, for the "add members" picker in GroupMembersPanel. */
  allUsers: Person[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [members, setMembers] = useState<Person[]>(initialMembers);
  const [text, setText] = useState("");
  const [atts, setAtts] = useState<Att[]>([]);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [uploading, setUploading] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Msg | null>(null);
  const [reactingTo, setReactingTo] = useState<number | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [newWhileAway, setNewWhileAway] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiBoxRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const atBottomRef = useRef(true);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const messageEls = useRef<Map<number, HTMLDivElement>>(new Map());

  const senderMap = useMemo(() => {
    const map = new Map<number, Person>();
    for (const m of members) map.set(m.id, m);
    return map;
  }, [members]);
  const senderName = useCallback(
    (id: number) => senderMap.get(id)?.name ?? "Former member",
    [senderMap]
  );

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
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottomRef.current = atBottom;
    setShowJumpToBottom(!atBottom);
    if (atBottom) setNewWhileAway(0);
  };

  useEffect(() => {
    scrollToBottom();
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      return Array.from(byId.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id);
    });
  }, []);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      const realIds = messagesRef.current.filter((m) => m.id > 0).map((m) => m.id);
      const after = realIds.length ? Math.max(...realIds) : 0;
      try {
        const res = await fetch(`/api/groups/${group.id}?after=${after}`, { cache: "no-store" });
        if (!res.ok || !active) return;
        const data = await res.json();
        const incoming = data.messages as Msg[];
        mergeIncoming(incoming);
        const fromOthers = incoming.filter((m) => m.senderId !== meId).length;
        if (fromOthers > 0 && !atBottomRef.current) setNewWhileAway((n) => n + fromOthers);
        if (Array.isArray(data.deletedIds) && data.deletedIds.length) {
          const del = new Set<number>(data.deletedIds);
          setMessages((prev) => prev.map((m) => (del.has(m.id) && !m.deleted ? { ...m, deleted: true, body: "", attachments: [] } : m)));
        }
        if (Array.isArray(data.allReactions)) {
          const byId = new Map<number, Reaction[]>(data.allReactions.map((r: { messageId: number; reactions: Reaction[] }) => [r.messageId, r.reactions]));
          setMessages((prev) =>
            prev.map((m) => {
              const next = byId.get(m.id) ?? [];
              const cur = m.reactions ?? [];
              return next.length === 0 && cur.length === 0 ? m : { ...m, reactions: next };
            })
          );
        }
        if (Array.isArray(data.myStarredIds)) {
          const starredSet = new Set<number>(data.myStarredIds);
          setMessages((prev) => prev.map((m) => (!!m.starred === starredSet.has(m.id) ? m : { ...m, starred: starredSet.has(m.id) })));
        }
        if (Array.isArray(data.members)) setMembers(data.members);
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
  }, [group.id, meId, mergeIncoming]);

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
          ? { id: replySnapshot.id, body: replySnapshot.body, senderId: replySnapshot.senderId, hasAttachment: !!replySnapshot.attachments?.length }
          : null,
      };
      setMessages((prev) => [...prev, optimistic]);
      atBottomRef.current = true;
      requestAnimationFrame(() => scrollToBottom(true));

      const res = await sendGroupMessage(group.id, body, sending.map((a) => a.id), replyToId ?? null);
      if ("error" in res) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
        return;
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === res.id)) return prev.filter((m) => m.id !== tempId);
        return prev.map((m) =>
          m.id === tempId
            ? { id: res.id, body: res.body, senderId: res.senderId, createdAt: res.createdAt, attachments: res.attachments, replyTo: res.replyTo }
            : m
        );
      });
    },
    [meId, group.id, scrollToBottom]
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
    void deleteGroupMessage(id);
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
          next = idx >= 0 ? next.map((r, i) => (i === idx ? { ...r, count: r.count + 1, mine: true } : r)) : [...next, { emoji, count: 1, mine: true }];
        }
        return { ...m, reactions: next };
      })
    );
    const res = await toggleGroupReaction(messageId, emoji);
    if (!("error" in res)) setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: res.reactions } : m)));
  }, []);

  const handleStar = useCallback(async (messageId: number) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, starred: !m.starred } : m)));
    const res = await toggleGroupStar(messageId);
    if (!("error" in res)) setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, starred: res.starred } : m)));
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

  const { media, docs, links, starred } = useMemo(() => {
    const media: PanelItem[] = [];
    const docs: PanelItem[] = [];
    const links: PanelLink[] = [];
    const starred: PanelStarred[] = [];
    const urlRe = /https?:\/\/[^\s]+/g;
    for (const m of messages) {
      if (m.deleted || m.pending || m.failed) continue;
      for (const a of m.attachments ?? []) {
        const item: PanelItem = { id: a.id, name: a.name, mimeType: a.mimeType, size: a.size, at: m.createdAt };
        (isImage(a) ? media : docs).push(item);
      }
      const found = m.body.match(urlRe);
      if (found) for (const url of found) links.push({ url, at: m.createdAt });
      if (m.starred) starred.push({ id: m.id, body: m.body, senderId: m.senderId, at: m.createdAt, hasAttachment: !!m.attachments?.length });
    }
    return { media: media.reverse(), docs: docs.reverse(), links: links.reverse(), starred: starred.reverse() };
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
        <Link href="/discussion" className="rounded-lg px-1.5 py-1 text-lg text-slate-500 hover:bg-slate-100 md:hidden dark:hover:bg-slate-700">
          ←
        </Link>
        <button type="button" onClick={() => setShowMembers((s) => !s)} className="flex items-center gap-3 rounded-lg px-1 py-0.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${groupColor(group.name)}`}>
            {group.name.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold leading-tight">{group.name}</span>
            <span className="block text-xs text-slate-500">
              {members.length} member{members.length === 1 ? "" : "s"}
            </span>
          </span>
        </button>
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
              searchOpen ? "border-sky-500 bg-sky-50 text-sky-600 dark:border-sky-500 dark:bg-sky-900/30 dark:text-sky-400" : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800"
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
              showInfo ? "border-sky-500 bg-sky-50 text-sky-600 dark:border-sky-500 dark:bg-sky-900/30 dark:text-sky-400" : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800"
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
            placeholder="Search in this group"
            className="input min-w-[10rem] flex-1 !py-1.5 text-sm"
          />
          {searchQuery.trim() && (
            <span className="shrink-0 text-xs text-slate-400">{searchMatches.length ? `${searchIndex + 1}/${searchMatches.length}` : "0/0"}</span>
          )}
          <button type="button" onClick={() => stepSearch(-1)} disabled={!searchMatches.length} title="Previous match" aria-label="Previous match" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-700">
            ▲
          </button>
          <button type="button" onClick={() => stepSearch(1)} disabled={!searchMatches.length} title="Next match" aria-label="Next match" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-700">
            ▼
          </button>
          <div className="h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-600" />
          <DatePicker compact title="Jump to date" onPick={jumpToDate} />
          <button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search" className="ml-auto shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
            ✕
          </button>
        </div>
      )}

      {/* Message list */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        {messages.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No messages yet. Say hello to the group.</p>}
        {groups.map((g) => (
          <div key={g.label} className="space-y-2">
            <div className="sticky top-0 z-10 flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-300">{g.label}</span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>
            {g.items.map((m) => {
              const mine = m.senderId === meId;
              const sender = senderMap.get(m.senderId);
              if (m.deleted) {
                return (
                  <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                    {!mine && (sender ? <UserAvatar user={sender} size={26} /> : <span className="h-[26px] w-[26px] shrink-0" />)}
                    <div className="rounded-2xl bg-slate-100 px-3.5 py-2 text-sm italic text-slate-400 dark:bg-slate-700/50">🚫 This message was deleted</div>
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
                      onStar={() => void handleStar(m.id)}
                      starred={m.starred}
                      onDelete={mine && !m.pending ? () => onDelete(m.id) : undefined}
                    />
                  )}
                </div>
              );
              return (
                <div key={m.id} className={`group flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine && (sender ? <UserAvatar user={sender} size={26} className="mb-4" /> : <span className="mb-4 h-[26px] w-[26px] shrink-0" />)}
                  {mine && actions}
                  <div className={mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
                    <div
                      ref={(el) => {
                        if (el) messageEls.current.set(m.id, el);
                        else messageEls.current.delete(m.id);
                      }}
                      className={`max-w-[78vw] break-words rounded-2xl px-3.5 py-2 shadow-sm transition-shadow sm:max-w-md ${
                        mine ? `rounded-br-md bg-sky-600 text-white ${m.failed ? "!bg-red-500" : ""} ${m.pending ? "opacity-70" : ""}` : "rounded-bl-md bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                      } ${flashId === m.id ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900" : ""}`}
                    >
                      {!mine && (
                        <span className={`mb-0.5 block text-xs font-semibold ${senderNameColor(senderName(m.senderId))}`}>
                          {senderName(m.senderId)}
                        </span>
                      )}
                      {m.replyTo && (
                        <button
                          type="button"
                          onClick={() => scrollToMessage(m.replyTo!.id)}
                          className={`mb-1.5 block w-full rounded-lg border-l-4 px-2 py-1 text-left text-xs ${
                            mine ? "border-white/60 bg-white/10 text-white/90" : "border-sky-400 bg-slate-200/70 text-slate-600 dark:bg-slate-600/40 dark:text-slate-200"
                          }`}
                        >
                          <span className="block font-semibold">{m.replyTo.senderId === meId ? "You" : senderName(m.replyTo.senderId).split(" ")[0]}</span>
                          <span className="block truncate">{m.replyTo.body || (m.replyTo.hasAttachment ? "📎 Attachment" : "")}</span>
                        </button>
                      )}
                      {m.body && <p className="whitespace-pre-wrap text-sm">{renderBody(m.body, mine, searchOpen ? searchQuery : "")}</p>}
                      <AttachmentList atts={m.attachments ?? []} mine={mine} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-slate-400">
                      {m.starred && <span title="Starred" className="text-amber-500">★</span>}
                      <span>{timeLabel(m.createdAt)}</span>
                      {isLastMine && <span>{m.failed ? "· failed" : m.pending ? "· sending…" : ""}</span>}
                    </div>
                    {!!m.reactions?.length && (
                      <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`}>
                        {m.reactions.map((r) => (
                          <button
                            key={r.emoji}
                            type="button"
                            onClick={() => void handleReact(m.id, r.emoji)}
                            className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
                              r.mine ? "border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-900/30" : "border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800"
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

        {showJumpToBottom && (
          <div className="pointer-events-none sticky bottom-1 z-10 flex justify-end">
            <button
              type="button"
              onClick={() => {
                scrollToBottom(true);
                setNewWhileAway(0);
              }}
              title="Jump to latest"
              className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-lg hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              {newWhileAway > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-600 px-1 text-[10px] font-semibold text-white">
                  {newWhileAway > 99 ? "99+" : newWhileAway}
                </span>
              )}
              <span>↓ Jump to latest</span>
            </button>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800">
        {replyingTo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border-l-4 border-sky-500 bg-slate-100 px-3 py-1.5 text-xs dark:bg-slate-700">
            <div className="min-w-0 flex-1">
              <span className="block font-semibold text-sky-700 dark:text-sky-400">
                Replying to {replyingTo.senderId === meId ? "yourself" : senderName(replyingTo.senderId).split(" ")[0]}
              </span>
              <span className="block truncate text-slate-500 dark:text-slate-300">{replyingTo.body || (replyingTo.attachments?.length ? "📎 Attachment" : "")}</span>
            </div>
            <button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply" className="shrink-0 rounded-lg px-1.5 py-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600">
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
                <button type="button" onClick={() => setAtts((prev) => prev.filter((x) => x.id !== a.id))} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-xs text-white shadow" aria-label="Remove attachment">
                  ✕
                </button>
              </div>
            ))}
            {uploading > 0 && <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-[11px] text-slate-400 dark:bg-slate-700">Uploading…</div>}
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
          <button type="button" onClick={() => fileRef.current?.click()} title="Attach a file" className="btn-secondary shrink-0 !rounded-xl !px-3" aria-label="Attach a file">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <div ref={emojiBoxRef} className="relative shrink-0">
            <button type="button" onClick={() => setShowEmoji((s) => !s)} title="Emoji" aria-label="Emoji" className={`btn-secondary !rounded-xl !px-3 ${showEmoji ? "!border-sky-500 !bg-sky-50 !text-sky-600 dark:!bg-sky-900/30" : ""}`}>
              <span className="text-base leading-none">🙂</span>
            </button>
            {showEmoji && (
              <div className="absolute bottom-full left-0 z-30 mb-2 max-h-56 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-600 dark:bg-slate-800">
                <div className="grid grid-cols-8 gap-1">
                  {EMOJI_PICKER.map((e) => (
                    <button key={e} type="button" onClick={() => insertEmoji(e)} className="rounded-lg p-1 text-xl hover:bg-slate-100 dark:hover:bg-slate-700">
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
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            rows={1}
            maxLength={4000}
            placeholder="Message the group… (paste a screenshot too)"
            className="input max-h-40 flex-1 resize-none !py-2.5"
          />
          <button type="button" onClick={submit} disabled={!canSend} className="btn-primary shrink-0 !rounded-xl disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </div>
      </div>

      {showInfo && (
        <ChatInfoPanel
          media={media}
          docs={docs}
          links={links}
          starred={starred}
          meId={meId}
          resolveSenderName={senderName}
          onJump={(id) => {
            setShowInfo(false);
            scrollToMessage(id);
          }}
          onClose={() => setShowInfo(false)}
        />
      )}

      {showMembers && (
        <GroupMembersPanel
          groupId={group.id}
          groupName={group.name}
          members={members}
          allUsers={allUsers}
          meId={meId}
          onClose={() => setShowMembers(false)}
        />
      )}

      <ConfirmDialog open={pendingDelete !== null} message="Delete this message for everyone?" onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />
    </div>
  );
}
