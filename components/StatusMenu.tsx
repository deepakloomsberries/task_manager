"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import UserAvatar from "@/components/UserAvatar";
import { setPresence } from "@/lib/actions/presence";
import { PRESENCE, PRESENCE_CHOICES, PRESENCE_DURATIONS, chosenPresence, presenceLabel, type PresenceInput } from "@/lib/presence";

/**
 * Your avatar in the header, Teams-style: shows your status and opens a menu
 * to set Available / Busy / In a meeting / Do not disturb / Away / Appear
 * offline, a status message and when it clears.
 */
export default function StatusMenu({
  user,
  subtitle,
  presence,
}: {
  user: { id: number; name: string; avatarPath: string | null };
  subtitle: string;
  presence: PresenceInput;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const current = chosenPresence(presence) ?? "";
  const [text, setText] = useState(presence.presenceText ?? "");
  const [duration, setDuration] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  // "Now" as seen by me: I'm looking at the page, so I count as active.
  const mine: PresenceInput = { ...presence, lastSeenAt: new Date().toISOString() };

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const save = (status: string, message = text, dur = duration) => {
    const fd = new FormData();
    fd.set("status", status);
    fd.set("text", message);
    fd.set("duration", dur);
    start(() => setPresence(fd));
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Set your status (${presenceLabel(mine)})`}
        className="flex items-center gap-3 rounded-lg p-1 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
      >
        <span suppressHydrationWarning>
          <UserAvatar user={user} size={36} presence={mine} />
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-sm font-medium">{user.name}</span>
          <span className="block max-w-[180px] truncate text-xs text-slate-500 dark:text-slate-400" suppressHydrationWarning>
            {current || presence.presenceText || presence.onLeave ? presenceLabel(mine) : subtitle}
          </span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Status</div>
          {PRESENCE_CHOICES.map((c) => {
            const key = (c.value || "AVAILABLE") as keyof typeof PRESENCE;
            const meta = PRESENCE[c.value === "OFFLINE" ? "OFFLINE" : key];
            return (
              <button
                key={c.value}
                type="button"
                role="menuitemradio"
                aria-checked={current === c.value}
                disabled={pending}
                onClick={() => save(c.value)}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700 ${
                  current === c.value ? "bg-slate-50 dark:bg-slate-700/60" : ""
                }`}
              >
                <span className={`mt-1 flex h-3 w-3 shrink-0 items-center justify-center rounded-full ${meta.dot}`}>
                  {c.value === "DND" && <span className="h-[2px] w-1.5 rounded bg-white" />}
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{c.label}</span>
                  <span className="block text-xs text-slate-500">{c.hint}</span>
                </span>
                {current === c.value && <span className="text-sky-600">✓</span>}
              </button>
            );
          })}

          <form
            className="mt-1 space-y-2 border-t border-slate-100 px-3 pb-1 pt-3 dark:border-slate-700"
            onSubmit={(e) => {
              e.preventDefault();
              save(current);
            }}
          >
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400" htmlFor="status-text">
              Status message
            </label>
            <input
              id="status-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={80}
              placeholder="e.g. Back at 3pm · At the factory"
              className="input !py-1.5 text-sm"
            />
            <div className="flex items-center gap-2">
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="input !py-1.5 text-xs"
                aria-label="Clear status after"
              >
                {PRESENCE_DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.value ? `Clear after ${d.label.toLowerCase()}` : d.label}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={pending} className="btn-primary !px-3 !py-1.5 text-xs">
                Save
              </button>
            </div>
            {(current || presence.presenceText) && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setText("");
                  save("", "", "");
                }}
                className="text-xs text-slate-500 hover:underline"
              >
                Reset to automatic
              </button>
            )}
            {presence.presenceUntil && current && (
              <p className="text-[11px] text-slate-400" suppressHydrationWarning>
                Clears{" "}
                {new Date(presence.presenceUntil).toLocaleString("en-GB", {
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </form>

          <div className="mt-1 border-t border-slate-100 pt-1 dark:border-slate-700">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              ⚙ Profile &amp; settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
