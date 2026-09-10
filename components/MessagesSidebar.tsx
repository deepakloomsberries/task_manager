"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import UserAvatar from "@/components/UserAvatar";
import StartChat from "@/components/StartChat";
import { fmtChatListTime } from "@/lib/ui";

type Person = {
  id: number;
  name: string;
  jobTitle?: string | null;
  avatarPath?: string | null;
  lastSeenAt?: Date | string | null;
};

export type Convo = {
  partner: { id: number; name: string; avatarPath: string | null; lastSeenAt: Date | null };
  lastBody: string;
  lastAt: Date;
  fromMe: boolean;
  unread: number;
};

/** WhatsApp-style chat list: search, All/Unread tabs, a "+" to start a new
 *  conversation, and the conversation list itself with the active chat
 *  highlighted. Filtering happens client-side against data the layout
 *  already fetched — no round trip for something this small. */
export default function MessagesSidebar({ conversations, users }: { conversations: Convo[]; users: Person[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [showNew, setShowNew] = useState(false);

  const activeId = useMemo(() => {
    const m = /^\/messages\/(\d+)/.exec(pathname);
    return m ? Number(m[1]) : null;
  }, [pathname]);

  const totalUnread = conversations.reduce((n, c) => n + c.unread, 0);

  const filtered = conversations.filter((c) => {
    if (tab === "unread" && c.unread === 0) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return c.partner.name.toLowerCase().includes(q) || c.lastBody.toLowerCase().includes(q);
  });

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-800">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h1 className="text-lg font-bold">
          Chats{totalUnread > 0 && <span className="ml-1.5 text-sm font-normal text-slate-400">({totalUnread})</span>}
        </h1>
        <button
          type="button"
          onClick={() => setShowNew((s) => !s)}
          title="Start a new conversation"
          aria-label="Start a new conversation"
          className={`flex h-8 w-8 items-center justify-center rounded-full text-lg transition-colors ${
            showNew ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          }`}
        >
          {showNew ? "✕" : "+"}
        </button>
      </div>

      {showNew ? (
        <div className="border-b border-slate-200 p-3 dark:border-slate-700">
          <StartChat users={users} onSelect={() => setShowNew(false)} />
        </div>
      ) : (
        <>
          <div className="border-b border-slate-200 p-3 dark:border-slate-700">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or start a new chat"
              className="input !py-2 text-sm"
            />
            <div className="mt-2.5 flex gap-1.5">
              {(["all", "unread"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    tab === t
                      ? "bg-sky-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                  }`}
                >
                  {t === "all" ? "All" : `Unread${totalUnread > 0 ? ` ${totalUnread}` : ""}`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-slate-400">
                {conversations.length === 0
                  ? "No conversations yet. Tap + to start one."
                  : tab === "unread"
                    ? "No unread chats."
                    : "No matches."}
              </p>
            )}
            {filtered.map((c) => (
              <Link
                key={c.partner.id}
                href={`/messages/${c.partner.id}`}
                className={`flex items-center gap-3 border-b border-slate-50 px-4 py-3 transition-colors dark:border-slate-700/50 ${
                  activeId === c.partner.id
                    ? "bg-sky-50 dark:bg-sky-900/20"
                    : "hover:bg-slate-50 dark:hover:bg-slate-700/40"
                }`}
              >
                <UserAvatar user={c.partner} size={44} presence={c.partner.lastSeenAt} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.partner.name}</span>
                    <span className={`shrink-0 text-[11px] ${c.unread > 0 ? "font-semibold text-sky-600" : "text-slate-400"}`}>
                      {fmtChatListTime(c.lastAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-500">
                      {c.fromMe ? "You: " : ""}
                      {c.lastBody || " "}
                    </span>
                    {c.unread > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 px-1.5 text-[11px] font-semibold text-white">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
