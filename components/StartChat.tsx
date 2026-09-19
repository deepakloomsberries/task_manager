"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import UserAvatar from "@/components/UserAvatar";

type Person = {
  id: number;
  name: string;
  jobTitle?: string | null;
  avatarPath?: string | null;
  lastSeenAt?: Date | string | null;
};

export default function StartChat({ users, onSelect }: { users: Person[]; onSelect?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const filtered = query
    ? users.filter((u) => u.name.toLowerCase().includes(query.toLowerCase()))
    : users;

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search people…"
        className="input mb-2"
      />
      <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-slate-400">No people found.</p>
        )}
        {filtered.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => {
              onSelect?.();
              router.push(`/messages/${u.id}`);
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
          >
            <UserAvatar user={u} size={36} presence={u.lastSeenAt ?? null} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{u.name}</div>
              {u.jobTitle && (
                <div className="truncate text-xs text-slate-500">{u.jobTitle}</div>
              )}
            </div>
            <span className="text-xs text-sky-600">Chat →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
