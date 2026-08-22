"use client";

import { useRef, useState } from "react";
import type { ChecklistItem } from "@/lib/checklist";

/** An editable to-do list: toggle, edit text, add and remove items. Reports the
 *  full item list to the parent on every change (which serialises + saves). */
export default function ChecklistEditor({
  initial,
  onChange,
  autoFocus = false,
}: {
  initial: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  autoFocus?: boolean;
}) {
  const [items, setItems] = useState<ChecklistItem[]>(
    initial.length ? initial : [{ text: "", done: false }]
  );
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const commit = (next: ChecklistItem[]) => {
    setItems(next);
    onChange(next);
  };

  const setText = (i: number, text: string) =>
    commit(items.map((it, idx) => (idx === i ? { ...it, text } : it)));
  const toggle = (i: number) =>
    commit(items.map((it, idx) => (idx === i ? { ...it, done: !it.done } : it)));
  const remove = (i: number) => commit(items.filter((_, idx) => idx !== i));
  const add = (at?: number) => {
    const idx = at ?? items.length;
    const next = [...items];
    next.splice(idx, 0, { text: "", done: false });
    commit(next);
    setTimeout(() => inputs.current[idx]?.focus(), 0);
  };

  return (
    <div className="space-y-1">
      {items.map((it, i) => (
        <div key={i} className="group/item flex items-center gap-2">
          <input
            type="checkbox"
            checked={it.done}
            onChange={() => toggle(i)}
            className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          <input
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={it.text}
            autoFocus={autoFocus && i === 0}
            onChange={(e) => setText(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(i + 1);
              } else if (e.key === "Backspace" && it.text === "" && items.length > 1) {
                e.preventDefault();
                remove(i);
                setTimeout(() => inputs.current[Math.max(0, i - 1)]?.focus(), 0);
              }
            }}
            placeholder="List item"
            className={`flex-1 border-none bg-transparent px-1 py-0.5 text-sm focus:outline-none focus:ring-0 ${
              it.done ? "text-slate-400 line-through" : "text-slate-700"
            }`}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label="Remove item"
            className="text-slate-300 opacity-0 hover:text-red-500 group-hover/item:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => add()}
        className="mt-1 flex items-center gap-1.5 px-1 text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        <span className="text-base leading-none">＋</span> List item
      </button>
    </div>
  );
}
