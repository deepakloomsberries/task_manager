"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import CreateGroup from "@/components/CreateGroup";
import { fmtChatListTime } from "@/lib/ui";

type Person = { id: number; name: string; jobTitle?: string | null; avatarPath?: string | null };

export type GroupSummary = {
  id: number;
  name: string;
  memberCount: number;
  lastBody: string;
  lastAt: Date | null;
  lastSenderName: string | null;
  fromMe: boolean;
  unread: number;
};

const GROUP_COLORS = [
  "bg-sky-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-fuchsia-500", "bg-lime-600",
];
function groupColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
}

/** WhatsApp-style group list: search, All/Unread tabs, a "+" to create a new
 *  group, mirroring MessagesSidebar exactly so Discussion and Messages feel
 *  like the same app. */
export default function GroupsSidebar({ groups, users }: { groups: GroupSummary[]; users: Person[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [showNew, setShowNew] = useState(false);

  const activeId = useMemo(() => {
    const m = /^\/discussion\/(\d+)/.exec(pathname);
    return m ? Number(m[1]) : null;
  }, [pathname]);

  const totalUnread = groups.reduce((n, g) => n + g.unread, 0);

  const filtered = groups.filter((g) => {
    if (tab === "unread" && g.unread === 0) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return g.name.toLowerCase().includes(q) || g.lastBody.toLowerCase().includes(q);
  });

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-800">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <h1 className="text-lg font-bold">
          Discussion{totalUnread > 0 && <span className="ml-1.5 text-sm font-normal text-slate-400">({totalUnread})</span>}
        </h1>
        <button
          type="button"
          onClick={() => setShowNew((s) => !s)}
          title="Create a new group"
          aria-label="Create a new group"
          className={`flex h-8 w-8 items-center justify-center rounded-full text-lg transition-colors ${
            showNew ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          }`}
        >
          {showNew ? "✕" : "+"}
        </button>
      </div>

      {showNew ? (
        <div className="flex-1 overflow-y-auto border-b border-slate-200 p-3 dark:border-slate-700">
          <CreateGroup users={users} onDone={() => setShowNew(false)} />
        </div>
      ) : (
        <>
          <div className="border-b border-slate-200 p-3 dark:border-slate-700">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search groups"
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
                {groups.length === 0
                  ? "No groups yet. Tap + to create one."
                  : tab === "unread"
                    ? "No unread groups."
                    : "No matches."}
              </p>
            )}
            {filtered.map((g) => (
              <Link
                key={g.id}
                href={`/discussion/${g.id}`}
                className={`flex items-center gap-3 border-b border-slate-50 px-4 py-3 transition-colors dark:border-slate-700/50 ${
                  activeId === g.id ? "bg-sky-50 dark:bg-sky-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-700/40"
                }`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${groupColor(g.name)}`}
                >
                  {g.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{g.name}</span>
                    <span className={`shrink-0 text-[11px] ${g.unread > 0 ? "font-semibold text-sky-600" : "text-slate-400"}`}>
                      {g.lastAt ? fmtChatListTime(g.lastAt) : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-500">
                      {g.fromMe ? "You: " : g.lastSenderName ? `${g.lastSenderName.split(" ")[0]}: ` : ""}
                      {g.lastBody || `${g.memberCount} members`}
                    </span>
                    {g.unread > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 px-1.5 text-[11px] font-semibold text-white">
                        {g.unread}
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
