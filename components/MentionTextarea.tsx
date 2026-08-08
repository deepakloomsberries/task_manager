"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { initials, avatarColor } from "@/lib/ui";

export type MentionPerson = { id: number; name: string; jobTitle?: string | null };

/**
 * A textarea with an "@" autocomplete for mentioning teammates. Type "@" then a
 * name; pick from the dropdown (arrow keys + Enter/Tab, or click) to insert the
 * person's full name. The server resolves which names are mentions and notifies
 * those people — so nothing special is stored, just the text.
 *
 * Works controlled (pass value + onChange, e.g. the live chat composer) or
 * self-managed (pass just a name, e.g. inside a server-action form).
 */
export default function MentionTextarea({
  users,
  name,
  value,
  onChange,
  onEnterSubmit,
  rows = 2,
  required = false,
  maxLength,
  placeholder,
  className = "",
  onPaste,
}: {
  users: MentionPerson[];
  name?: string;
  value?: string;
  onChange?: (v: string) => void;
  onEnterSubmit?: () => void;
  rows?: number;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
  className?: string;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
}) {
  const [inner, setInner] = useState(value ?? "");
  const val = value !== undefined ? value : inner;
  const setVal = (v: string) => (onChange ? onChange(v) : setInner(v));

  const ref = useRef<HTMLTextAreaElement>(null);
  const [anchor, setAnchor] = useState<{ at: number; query: string } | null>(null);
  const [hi, setHi] = useState(0);

  const matches = useMemo(() => {
    if (!anchor) return [];
    const q = anchor.query.trim().toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 6);
  }, [anchor, users]);

  useEffect(() => setHi(0), [anchor?.query]);
  useEffect(() => {
    if (!val) setAnchor(null);
  }, [val]);

  const open = anchor !== null && matches.length > 0;

  function recompute(text: string, caret: number) {
    const upto = text.slice(0, caret);
    const m = upto.match(/(?:^|\s)@([\w.'-]{0,40})$/);
    if (!m) {
      setAnchor(null);
      return;
    }
    const query = m[1];
    setAnchor({ at: caret - query.length - 1, query });
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setVal(e.target.value);
    recompute(e.target.value, e.target.selectionStart ?? e.target.value.length);
  }

  function pick(person: MentionPerson) {
    if (!anchor) return;
    const caret = ref.current?.selectionStart ?? val.length;
    const before = val.slice(0, anchor.at);
    const after = val.slice(caret);
    const insert = `@${person.name} `;
    const next = before + insert + after;
    setVal(next);
    setAnchor(null);
    const pos = (before + insert).length;
    requestAnimationFrame(() => {
      const ta = ref.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHi((h) => (h + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHi((h) => (h - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(matches[hi]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAnchor(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && onEnterSubmit) {
      e.preventDefault();
      onEnterSubmit();
    }
  }

  return (
    <div className="relative flex-1">
      <textarea
        ref={ref}
        name={name}
        value={val}
        onChange={onInput}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => setTimeout(() => setAnchor(null), 120)}
        rows={rows}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        className={`input w-full ${className}`}
      />
      {open && (
        <ul className="absolute bottom-full z-20 mb-1 max-h-60 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.map((u, i) => (
            <li key={u.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(u);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  i === hi ? "bg-sky-50" : "hover:bg-slate-50"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${avatarColor(u.name)}`}
                >
                  {initials(u.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-700">{u.name}</span>
                  {u.jobTitle && <span className="block truncate text-xs text-slate-400">{u.jobTitle}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
