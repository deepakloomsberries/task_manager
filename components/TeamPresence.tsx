"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import UserAvatar from "@/components/UserAvatar";
import { PRESENCE, type PresenceKey } from "@/lib/presence";
import type { TeamMember } from "@/lib/teamPresence";

const POLL_MS = 30_000;
const AROUND: PresenceKey[] = ["AVAILABLE", "BUSY", "MEETING", "DND", "AWAY"];
const GROUPS: { title: string; keys: PresenceKey[] }[] = [
  { title: "Available", keys: ["AVAILABLE"] },
  { title: "Busy", keys: ["BUSY", "MEETING", "DND"] },
  { title: "Away", keys: ["AWAY"] },
  { title: "On leave", keys: ["LEAVE"] },
];

const first = (n: string) => n.split(" ")[0];
function ago(iso: string | null) {
  if (!iso) return null;
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function localTime(tz: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(new Date());
  } catch {
    return "";
  }
}

function Avatar({ m, size }: { m: TeamMember; size: number }) {
  const dot = Math.max(9, Math.round(size * 0.32));
  return (
    <span className="relative inline-flex shrink-0">
      <UserAvatar user={m} size={size} />
      <span
        className={`absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-white dark:ring-slate-800 ${PRESENCE[m.key].dot}`}
        style={{ width: dot, height: dot }}
        aria-hidden
      />
    </span>
  );
}

/**
 * "Who's around" in the header: the people online right now as chips (wide
 * screens) or a stacked avatar row, live-updated every 30 seconds. Click the
 * count for the whole team — status, message, office time, last seen — with
 * search and a one-click Message button.
 */
export default function TeamPresence({ initial }: { initial: TeamMember[] }) {
  const [team, setTeam] = useState(initial);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [showOffline, setShowOffline] = useState(false);
  const [, setTick] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/presence", { cache: "no-store" });
      if (r.ok) setTeam((await r.json()).team);
    } catch {
      /* keep the last list */
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
      setTick((t) => t + 1); // re-render "5m ago" / local times
    }, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const onDown = (e: MouseEvent) => rootRef.current && !rootRef.current.contains(e.target as Node) && setOpen(false);
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open, refresh]);

  const others = team.filter((m) => !m.me);
  const around = others.filter((m) => AROUND.includes(m.key));
  const onLeave = others.filter((m) => m.key === "LEAVE");
  const available = around.filter((m) => m.key === "AVAILABLE").length;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? others.filter((m) => m.name.toLowerCase().includes(s) || (m.jobTitle ?? "").toLowerCase().includes(s) || m.office.toLowerCase().includes(s)) : others;
  }, [others, q]);
  const offline = filtered.filter((m) => m.key === "OFFLINE");

  const row = (m: TeamMember) => (
    <li key={m.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50">
      <Link href={`/people/${m.id}`} onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar m={m} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{m.name}</span>
          <span className="block truncate text-xs text-slate-500">
            {m.key === "OFFLINE" ? (m.lastSeen ? `Last seen ${ago(m.lastSeen)}` : "Offline") : m.message ? <span className={PRESENCE[m.key].text}>{m.message}</span> : m.key !== "AVAILABLE" ? <span className={PRESENCE[m.key].text}>{m.label}</span> : (m.jobTitle ?? m.label)}
          </span>
        </span>
      </Link>
      <span className="shrink-0 text-right text-[11px] leading-tight text-slate-400" title={`Local time in ${m.office}`}>
        {m.office}
        <br />
        {localTime(m.tz)}
      </span>
      <Link
        href={`/messages/${m.id}`}
        onClick={() => setOpen(false)}
        className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-sky-100 hover:text-sky-700 dark:hover:bg-sky-900/40"
        title={`Message ${first(m.name)}`}
        aria-label={`Message ${m.name}`}
      >
        💬
      </Link>
    </li>
  );

  return (
    <div ref={rootRef} className="relative hidden min-w-0 md:block">
      <div className="flex min-w-0 items-center gap-1.5">
        {/* Wide screens: chips with first names. */}
        <div className="hidden min-w-0 items-center gap-1.5 overflow-hidden 2xl:flex">
          {around.slice(0, 7).map((m) => (
            <Link
              key={m.id}
              href={`/messages/${m.id}`}
              title={`${m.name} · ${m.message ? `${m.label} — ${m.message}` : m.label} — click to message`}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 py-0.5 pl-0.5 pr-2.5 text-xs hover:border-sky-300 hover:bg-sky-50 dark:border-slate-700 dark:hover:bg-slate-700/60"
            >
              <Avatar m={m} size={24} />
              <span className="font-medium text-slate-700 dark:text-slate-200">{first(m.name)}</span>
              {m.key !== "AVAILABLE" && <span className={`hidden text-[10px] min-[1700px]:inline ${PRESENCE[m.key].text}`}>· {m.label}</span>}
            </Link>
          ))}
        </div>
        {/* Narrower screens: a stacked avatar row. */}
        <div className="flex -space-x-2 2xl:hidden">
          {around.slice(0, 5).map((m) => (
            <Link key={m.id} href={`/messages/${m.id}`} title={`${m.name} · ${m.label} — click to message`} className="rounded-full ring-2 ring-white transition hover:z-10 hover:-translate-y-0.5 dark:ring-slate-800">
              <Avatar m={m} size={30} />
            </Link>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/60"
          title="See the whole team"
        >
          <span className="relative flex h-2 w-2">
            {available > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${around.length ? "bg-green-500" : "bg-slate-300"}`} />
          </span>
          {around.length > 7 ? <span className="hidden 2xl:inline">+{around.length - 7} · </span> : null}
          {around.length} online
          <span className="text-slate-400">▾</span>
        </button>
      </div>

      {open && (
        <div role="dialog" aria-label="Team" className="absolute left-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
          <div className="border-b border-slate-100 p-3 dark:border-slate-700">
            <div className="mb-2 flex items-center justify-between text-sm">
              <b>Team</b>
              <span className="text-xs text-slate-500">
                {around.length} online{onLeave.length ? ` · ${onLeave.length} on leave` : ""} · {others.length} people
              </span>
            </div>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, roles, offices…" className="input !py-1.5 text-sm" />
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {GROUPS.map((g) => {
              const list = filtered.filter((m) => g.keys.includes(m.key));
              if (!list.length) return null;
              return (
                <div key={g.title} className="mb-2">
                  <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {g.title} · {list.length}
                  </div>
                  <ul>{list.map(row)}</ul>
                </div>
              );
            })}
            {offline.length > 0 && (
              <div>
                <button type="button" onClick={() => setShowOffline((s) => !s)} className="w-full px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600">
                  {showOffline || q ? "▾" : "▸"} Offline · {offline.length}
                </button>
                {(showOffline || q) && <ul>{offline.map(row)}</ul>}
              </div>
            )}
            {filtered.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No one matches “{q}”.</p>}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500 dark:border-slate-700">
            <span>Updates every 30 seconds</span>
            <Link href="/messages" onClick={() => setOpen(false)} className="text-sky-600 hover:underline">
              Open messages →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
