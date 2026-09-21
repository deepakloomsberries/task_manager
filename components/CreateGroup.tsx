"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import UserAvatar from "@/components/UserAvatar";
import { createGroup } from "@/lib/actions/groups";

type Person = { id: number; name: string; jobTitle?: string | null; avatarPath?: string | null };

/** Name the group, pick teammates, create — same shape as WhatsApp's "New group" flow. */
export default function CreateGroup({ users, onDone }: { users: Person[]; onDone?: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = query ? users.filter((u) => u.name.toLowerCase().includes(query.toLowerCase())) : users;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!name.trim() || selected.size === 0 || saving) return;
    setSaving(true);
    setError(null);
    const res = await createGroup(name.trim(), Array.from(selected));
    setSaving(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    onDone?.();
    router.push(`/discussion/${res.id}`);
  }

  return (
    <div className="space-y-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name"
        maxLength={100}
        className="input"
      />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search people…"
        className="input"
      />
      <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
        {filtered.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">No people found.</p>}
        {filtered.map((u) => (
          <label
            key={u.id}
            className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
          >
            <input
              type="checkbox"
              checked={selected.has(u.id)}
              onChange={() => toggle(u.id)}
              className="h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <UserAvatar user={u} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{u.name}</div>
              {u.jobTitle && <div className="truncate text-xs text-slate-500">{u.jobTitle}</div>}
            </div>
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={!name.trim() || selected.size === 0 || saving}
        className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? "Creating…" : `Create group${selected.size ? ` (${selected.size + 1})` : ""}`}
      </button>
    </div>
  );
}
