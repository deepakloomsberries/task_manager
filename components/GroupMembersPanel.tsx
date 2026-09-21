"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import UserAvatar from "@/components/UserAvatar";
import ConfirmDialog from "@/components/ConfirmDialog";
import { addGroupMembers, leaveGroup } from "@/lib/actions/groups";

type Person = { id: number; name: string; jobTitle?: string | null; avatarPath?: string | null };

/** Slide-over panel — same shell as ChatInfoPanel — showing the group's
 *  members, a way to add more from the company directory, and leave. */
export default function GroupMembersPanel({
  groupId,
  groupName,
  members,
  allUsers,
  meId,
  onClose,
}: {
  groupId: number;
  groupName: string;
  members: Person[];
  allUsers: Person[];
  meId: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const memberIds = new Set(members.map((m) => m.id));
  const addable = allUsers.filter((u) => !memberIds.has(u.id));
  const filtered = query ? addable.filter((u) => u.name.toLowerCase().includes(query.toLowerCase())) : addable;

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitAdd() {
    if (selected.size === 0 || saving) return;
    setSaving(true);
    await addGroupMembers(groupId, Array.from(selected));
    setSaving(false);
    setSelected(new Set());
    setShowAdd(false);
    router.refresh();
  }

  async function doLeave() {
    setConfirmLeave(false);
    await leaveGroup(groupId);
    router.push("/discussion");
  }

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
        <h2 className="font-semibold">{groupName}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {showAdd ? (
          <div className="space-y-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people…"
              className="input !py-1.5 text-sm"
            />
            <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
              {filtered.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-400">Everyone&apos;s already in the group.</p>
              )}
              {filtered.map((u) => (
                <label
                  key={u.id}
                  className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggle(u.id)}
                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <UserAvatar user={u} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary flex-1 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitAdd}
                disabled={selected.size === 0 || saving}
                className="btn-primary flex-1 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Adding…" : `Add${selected.size ? ` (${selected.size})` : ""}`}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {members.length} member{members.length === 1 ? "" : "s"}
              </span>
              <button type="button" onClick={() => setShowAdd(true)} className="text-xs font-medium text-sky-600 hover:underline">
                + Add
              </button>
            </div>
            <div className="space-y-0.5">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <UserAvatar user={m} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {m.id === meId ? "You" : m.name}
                    {m.jobTitle && <span className="block truncate text-xs text-slate-400">{m.jobTitle}</span>}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="border-t border-slate-200 p-3 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setConfirmLeave(true)}
          className="w-full rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          Leave group
        </button>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        message={`Leave "${groupName}"? You'll stop seeing new messages, but the group keeps going for everyone else.`}
        onCancel={() => setConfirmLeave(false)}
        onConfirm={doLeave}
      />
    </div>
  );
}
