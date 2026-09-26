"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import UserAvatar from "@/components/UserAvatar";
import { forwardMessage, forwardTargets, type ForwardTargets } from "@/lib/actions/forward";

/**
 * "Forward to…" picker, WhatsApp-style: search people and groups, tick one or
 * more, send. Shared by direct messages and group chats.
 */
export default function ForwardDialog({
  kind,
  messageId,
  preview,
  onClose,
  onDone,
}: {
  kind: "dm" | "group";
  messageId: number;
  preview: string;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [targets, setTargets] = useState<ForwardTargets | null>(null);
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Set<number>>(new Set());
  const [groups, setGroups] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    void forwardTargets().then(setTargets);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const needle = q.trim().toLowerCase();
  const shownGroups = useMemo(() => (targets?.groups ?? []).filter((g) => g.name.toLowerCase().includes(needle)), [targets, needle]);
  const shownPeople = useMemo(
    () => (targets?.people ?? []).filter((p) => `${p.name} ${p.jobTitle ?? ""}`.toLowerCase().includes(needle)),
    [targets, needle]
  );
  const count = people.size + groups.size;

  const toggle = (set: Set<number>, setter: (s: Set<number>) => void, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  const send = () =>
    start(async () => {
      setError(null);
      const r = await forwardMessage(kind, messageId, Array.from(people), Array.from(groups));
      if (!r.ok) return setError(r.error);
      onDone(
        r.failed
          ? `Forwarded to ${r.sent} chat${r.sent === 1 ? "" : "s"} — ${r.failed} couldn't be sent.`
          : `Forwarded to ${r.sent} chat${r.sent === 1 ? "" : "s"}.`
      );
    });

  const row = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50";
  const box = (on: boolean) =>
    `flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs ${
      on ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 dark:border-slate-500"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Forward message"
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl dark:bg-slate-800"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 className="font-semibold">Forward message</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
            ✕
          </button>
        </div>
        <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <div className="mb-2 truncate rounded-lg border-l-4 border-sky-400 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            ↪ {preview}
          </div>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people or groups…" className="input" />
        </div>

        <div className="min-h-[200px] flex-1 overflow-y-auto px-2 py-2">
          {!targets && <p className="p-4 text-center text-sm text-slate-400">Loading…</p>}
          {shownGroups.length > 0 && <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Groups</div>}
          {shownGroups.map((g) => (
            <button key={`g${g.id}`} type="button" className={row} onClick={() => toggle(groups, setGroups, g.id)} aria-pressed={groups.has(g.id)}>
              <span className={box(groups.has(g.id))}>{groups.has(g.id) && "✓"}</span>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm dark:bg-violet-900/40">👥</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{g.name}</span>
                <span className="block text-xs text-slate-400">{g.members} members</span>
              </span>
            </button>
          ))}
          {shownPeople.length > 0 && <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">People</div>}
          {shownPeople.map((p) => (
            <button key={`p${p.id}`} type="button" className={row} onClick={() => toggle(people, setPeople, p.id)} aria-pressed={people.has(p.id)}>
              <span className={box(people.has(p.id))}>{people.has(p.id) && "✓"}</span>
              <UserAvatar user={p} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                {p.jobTitle && <span className="block truncate text-xs text-slate-400">{p.jobTitle}</span>}
              </span>
            </button>
          ))}
          {targets && shownGroups.length + shownPeople.length === 0 && <p className="p-4 text-center text-sm text-slate-400">No matches.</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <span className="text-sm text-slate-500">{error ? <span className="text-red-600">{error}</span> : count ? `${count} selected` : "Pick one or more"}</span>
          <button type="button" onClick={send} disabled={!count || pending} className="btn-primary">
            {pending ? "Sending…" : "Forward"}
          </button>
        </div>
      </div>
    </div>
  );
}
