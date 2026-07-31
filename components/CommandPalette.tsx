"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createTask } from "@/lib/actions/tasks";
import { TASK_PRIORITIES } from "@/lib/ui";

type Lite = { id: number; name: string };
type TaskHit = { id: number; title: string; status: string; projectName: string | null };

const NAV: { label: string; href: string; icon: string }[] = [
  { label: "Dashboard", href: "/dashboard", icon: "▦" },
  { label: "My Tasks", href: "/my-tasks", icon: "◎" },
  { label: "Tasks", href: "/tasks", icon: "☑" },
  { label: "Projects", href: "/projects", icon: "▤" },
  { label: "Calendar", href: "/calendar", icon: "▧" },
  { label: "Messages", href: "/messages", icon: "✉" },
  { label: "Time sheet", href: "/timesheet", icon: "◷" },
  { label: "Notes", href: "/notes", icon: "✎" },
  { label: "Reports", href: "/reports", icon: "▙" },
  { label: "Settings", href: "/settings", icon: "⚙" },
];

/** Small header button that opens the palette (works on touch, where ⌘K can't). */
export function CommandButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("command:open"))}
      title="Search & commands (⌘K)"
      className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/50 dark:hover:bg-slate-700"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <span className="hidden sm:inline">Search…</span>
      <kbd className="hidden rounded bg-white px-1.5 text-[10px] font-semibold text-slate-400 sm:inline dark:bg-slate-800">
        ⌘K
      </kbd>
    </button>
  );
}

type Item = { key: string; label: string; sub?: string; icon: string; run: () => void };

export default function CommandPalette({ users, projects }: { users: Lite[]; projects: Lite[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "add">("search");
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<TaskHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setMode("search");
    setQuery("");
    setTasks([]);
    setActive(0);
  };

  // Global open/close: ⌘K / Ctrl+K, plus a custom event from the header button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("command:open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("command:open", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
    else close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced task search.
  useEffect(() => {
    if (!open || mode !== "search") return;
    const q = query.trim();
    if (!q) {
      setTasks([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/command?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        if (res.ok) setTasks((await res.json()).tasks ?? []);
      } catch {
        /* ignore */
      }
    }, 160);
    return () => clearTimeout(t);
  }, [query, open, mode]);

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const list: Item[] = [];
    if (q) {
      list.push({
        key: "new",
        label: `Create task “${query.trim()}”`,
        icon: "＋",
        run: () => setMode("add"),
      });
    }
    for (const n of NAV) {
      if (!q || n.label.toLowerCase().includes(q)) {
        list.push({ key: `nav-${n.href}`, label: n.label, sub: "Go to", icon: n.icon, run: () => go(n.href) });
      }
    }
    for (const p of projects) {
      if (q && p.name.toLowerCase().includes(q)) {
        list.push({ key: `proj-${p.id}`, label: p.name, sub: "Project", icon: "▤", run: () => go(`/projects/${p.id}`) });
      }
    }
    for (const t of tasks) {
      list.push({
        key: `task-${t.id}`,
        label: t.title,
        sub: `TM-${t.id}${t.projectName ? ` · ${t.projectName}` : ""}`,
        icon: "☑",
        run: () => go(`/tasks/${t.id}`),
      });
    }
    if (q) {
      list.push({
        key: "search-all",
        label: `Search everything for “${query.trim()}”`,
        sub: "Full search",
        icon: "⌕",
        run: () => go(`/search?q=${encodeURIComponent(query.trim())}`),
      });
    }
    return list.slice(0, 40);
  }, [query, tasks, projects]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setActive(0), [query, mode]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[10vh]" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-slate-900/40" onClick={close} aria-hidden />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
        {mode === "search" ? (
          <>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, items.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  items[active]?.run();
                }
              }}
              placeholder="Search tasks, projects, pages… or type to create a task"
              className="w-full border-b border-slate-200 bg-transparent px-4 py-3.5 text-sm outline-none dark:border-slate-700"
            />
            <div className="max-h-80 overflow-y-auto py-1">
              {items.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-400">
                  {query ? "No matches. Keep typing to create a task." : "Type to search."}
                </p>
              )}
              {items.map((it, i) => (
                <button
                  key={it.key}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={it.run}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${
                    i === active ? "bg-sky-50 dark:bg-sky-950/40" : ""
                  }`}
                >
                  <span className="w-5 text-center text-slate-400">{it.icon}</span>
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.sub && <span className="shrink-0 text-xs text-slate-400">{it.sub}</span>}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 border-t border-slate-200 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-700">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
            </div>
          </>
        ) : (
          <QuickAdd initialTitle={query.trim()} users={users} projects={projects} onCancel={() => setMode("search")} />
        )}
      </div>
    </div>
  );
}

function QuickAdd({
  initialTitle,
  users,
  projects,
  onCancel,
}: {
  initialTitle: string;
  users: Lite[];
  projects: Lite[];
  onCancel: () => void;
}) {
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  return (
    <form action={createTask} className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">New task</h2>
        <button type="button" onClick={onCancel} className="text-xs text-slate-400 hover:underline">
          ← Back to search
        </button>
      </div>
      <input
        ref={titleRef}
        name="title"
        required
        defaultValue={initialTitle}
        placeholder="Task title"
        className="input mb-3"
      />
      <div className="grid grid-cols-2 gap-2">
        <select name="projectId" defaultValue="" className="input">
          <option value="">— Project —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select name="assigneeId" defaultValue="" className="input">
          <option value="">— Assignee —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select name="priority" defaultValue="MEDIUM" className="input">
          {TASK_PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <input name="dueDate" type="date" className="input" />
      </div>
      <div className="mt-3 flex justify-end">
        <button type="submit" className="btn-primary">
          Create task
        </button>
      </div>
    </form>
  );
}
