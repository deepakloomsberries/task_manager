"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import UserAvatar from "@/components/UserAvatar";
import { sendMessage } from "@/lib/actions/messages";
import { isOnline, lastSeenLabel } from "@/lib/ui";

type Msg = {
  id: number;
  body: string;
  senderId: number;
  createdAt: string;
  pending?: boolean;
  failed?: boolean;
};

type Person = {
  id: number;
  name: string;
  jobTitle?: string | null;
  email: string;
  avatarPath?: string | null;
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
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [lastReadMyId, setLastReadMyId] = useState(initialLastReadMyId);
  const [partnerLastSeen, setPartnerLastSeen] = useState<string | null>(initialPartnerLastSeenAt);
  const [text, setText] = useState("");
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [, forceTick] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const lastTypingPing = useRef(0);
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

  // Land at the newest message on first paint.
  useEffect(() => {
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Merge helper — dedupes by id and drops an optimistic bubble once its real
  // counterpart (same author + body) arrives from the server.
  const mergeIncoming = useCallback((incoming: Msg[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      let changed = false;
      const pendings = prev.filter((m) => m.pending);
      for (const m of incoming) {
        if (byId.has(m.id)) continue;
        // Reconcile against an optimistic bubble we already drew.
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
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id
      );
    });
  }, []);

  // Poll for new messages, read receipts and presence.
  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      const realIds = messagesRef.current.filter((m) => m.id > 0).map((m) => m.id);
      const after = realIds.length ? Math.max(...realIds) : 0;
      try {
        const res = await fetch(`/api/messages/${other.id}?after=${after}`, {
          cache: "no-store",
        });
        if (!res.ok || !active) return;
        const data = await res.json();
        mergeIncoming(data.messages as Msg[]);
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

  // Keep the view pinned to the newest message (or the typing bubble) when the
  // user is already at the bottom.
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [messages, partnerTyping, scrollToBottom]);

  // Let the other side know we're typing — throttled so it's at most one ping
  // every couple of seconds no matter how fast someone types.
  const pingTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingPing.current < 2500) return;
    lastTypingPing.current = now;
    fetch(`/api/messages/${other.id}/typing`, { method: "POST", keepalive: true }).catch(() => {});
  }, [other.id]);

  // Let the "Active now / last seen" label decay over time.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  async function submit() {
    const body = text.trim();
    if (!body) return;
    const tempId = -Date.now();
    const optimistic: Msg = {
      id: tempId,
      body,
      senderId: meId,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");
    atBottomRef.current = true;
    requestAnimationFrame(() => scrollToBottom(true));

    const res = await sendMessage(other.id, body);
    if ("error" in res) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m))
      );
      return;
    }
    setMessages((prev) => {
      if (prev.some((m) => m.id === res.id)) {
        return prev.filter((m) => m.id !== tempId);
      }
      return prev.map((m) =>
        m.id === tempId
          ? { id: res.id, body: res.body, senderId: res.senderId, createdAt: res.createdAt }
          : m
      );
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const online = isOnline(partnerLastSeen);
  // The last message I sent (including a still-pending optimistic one) — this is
  // where the "sending… / Delivered / Seen" receipt is shown, iMessage-style.
  let lastMineKey: number | null = null;
  for (const m of messages) if (m.senderId === meId) lastMineKey = m.id;

  // Group consecutive messages by day for the date separators.
  const groups: { label: string; items: Msg[] }[] = [];
  for (const m of messages) {
    const label = dayLabel(m.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-3">
      {/* Header */}
      <div className="card flex items-center gap-3 p-3">
        <Link href="/messages" className="rounded-lg px-1.5 py-1 text-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
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
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="card flex-1 space-y-4 overflow-y-auto p-4 sm:p-5"
      >
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
              const isLastMine = mine && m.id === lastMineKey;
              return (
                <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                  {!mine && <UserAvatar user={other} size={26} className="mb-4" />}
                  <div className={mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
                    <div
                      className={`max-w-[78vw] break-words rounded-2xl px-3.5 py-2 shadow-sm sm:max-w-md ${
                        mine
                          ? `rounded-br-md bg-sky-600 text-white ${m.failed ? "!bg-red-500" : ""} ${m.pending ? "opacity-70" : ""}`
                          : "rounded-bl-md bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                      }`}
                    >
                      <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                    </div>
                    <div className={`mt-0.5 flex items-center gap-1 px-1 text-[10px] ${mine ? "text-slate-400" : "text-slate-400"}`}>
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
                  </div>
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
      <div className="card flex items-end gap-2 p-2.5">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value.trim()) pingTyping();
          }}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={4000}
          placeholder={`Message ${other.name.split(" ")[0]}…`}
          className="input max-h-40 flex-1 resize-none !py-2.5"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
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
  );
}
