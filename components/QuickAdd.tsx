"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { quickAddTask } from "@/lib/actions/tasks";

/** Inline fast-capture: type a title, press Enter — a task due today is added. */
export default function QuickAdd() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setTitle("");
    const fd = new FormData();
    fd.append("title", t);
    start(async () => {
      await quickAddTask(fd);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="card flex items-center gap-2 py-1.5 pl-4 pr-2">
      <span className="select-none text-lg text-slate-400">＋</span>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Quick add a task for today…  press Enter"
        maxLength={300}
        className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-slate-400"
      />
      {pending && <span className="pr-1 text-xs text-slate-400">adding…</span>}
      <button
        type="submit"
        disabled={!title.trim() || pending}
        className="btn-primary !py-1.5 text-xs disabled:opacity-40"
      >
        Add
      </button>
    </form>
  );
}
