"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { taskHref } from "@/lib/backLink";
import { createTaskOnDay, rescheduleTask } from "@/lib/actions/tasks";
import DatePicker from "@/components/DatePicker";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_CHIPS = 3;

export type CalDay = { date: string; inMonth: boolean; today: boolean; weekend: boolean; past: boolean };
/** A holiday or someone's leave, shown as a small label on a day. */
export type CalMark = { date: string; label: string; kind: "holiday" | "leave"; title?: string };
export type CalTask = {
  id: number;
  title: string;
  status: string;
  priority: string;
  assigneeName: string | null;
  projectName: string | null;
  date: string | null;
  overdue: boolean;
  editable: boolean;
};

const PRIORITY: Record<string, { dot: string; bar: string; label: string }> = {
  URGENT: { dot: "bg-red-500", bar: "border-l-red-500", label: "Urgent" },
  HIGH: { dot: "bg-orange-500", bar: "border-l-orange-500", label: "High" },
  MEDIUM: { dot: "bg-sky-500", bar: "border-l-sky-500", label: "Medium" },
  LOW: { dot: "bg-slate-400", bar: "border-l-slate-400", label: "Low" },
};
const STATUS: Record<string, { label: string; cls: string }> = {
  TODO: { label: "To do", cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
  IN_PROGRESS: { label: "In progress", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  REVIEW: { label: "In review", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  DONE: { label: "Done", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
};

const initials = (n: string) =>
  n
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const dayNum = (d: string) => Number(d.slice(8));
const longDate = (d: string) => {
  const dt = new Date(`${d}T00:00:00Z`);
  return `${DAY_NAMES[dt.getUTCDay()]}, ${dayNum(d)} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
};

const shortDate = (d: string) => {
  const dt = new Date(`${d}T00:00:00Z`);
  return `${DAY_NAMES[dt.getUTCDay()].slice(0, 3)} ${dayNum(d)} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
};

/**
 * The calendar: Month (whole weeks, neighbouring days dimmed), Week (every
 * task in full) and Agenda (a list, best on phones). Editable tasks drag
 * between days — including from the "No due date" tray — and any day opens a
 * panel to see all its tasks, move them, or add a new one.
 */
export default function CalendarBoard({
  view,
  days,
  tasks,
  unscheduled,
  marks,
  showAssignee,
  people,
  defaultAssignee,
  nav,
  back,
}: {
  view: "month" | "week" | "agenda";
  days: CalDay[];
  tasks: CalTask[];
  unscheduled: CalTask[];
  marks: CalMark[];
  showAssignee: boolean;
  /** Managers can add tasks for others. */
  people: { id: number; name: string }[];
  defaultAssignee: number;
  nav: { prev: string; next: string; today: string };
  back: string;
}) {
  const router = useRouter();
  const [moves, setMoves] = useState<Record<number, string | null>>({});
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<{ date: string; add: boolean } | null>(null);
  const [trayOpen, setTrayOpen] = useState(true);
  const [isPending, startTransition] = useTransition();

  // Moves are optimistic; clear them once fresh data arrives.
  useEffect(() => setMoves({}), [tasks, unscheduled]);

  // ← / → / T keyboard navigation (not while typing or with a panel open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (openDay || e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      if (e.key === "ArrowLeft") router.push(nav.prev);
      else if (e.key === "ArrowRight") router.push(nav.next);
      else if (e.key === "t" || e.key === "T") router.push(nav.today);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openDay, router, nav]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalTask[]>();
    for (const t of [...tasks, ...unscheduled]) {
      const d = t.id in moves ? moves[t.id] : t.date;
      if (!d) continue;
      m.set(d, [...(m.get(d) ?? []), t]);
    }
    return m;
  }, [tasks, unscheduled, moves]);
  const tray = unscheduled.filter((t) => !(t.id in moves) || !moves[t.id]);
  const marksOn = (d: string) => marks.filter((m) => m.date === d);

  const move = (id: number, date: string | null) => {
    setMoves((m) => ({ ...m, [id]: date }));
    startTransition(async () => {
      await rescheduleTask(id, date);
      router.refresh();
    });
  };

  const onDrop = (e: React.DragEvent, date: string) => {
    e.preventDefault();
    setDragOver(null);
    const id = Number(e.dataTransfer.getData("text/task-id"));
    if (id) move(id, date);
  };
  const dropProps = (date: string) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(date);
    },
    onDragLeave: () => setDragOver((d) => (d === date ? null : d)),
    onDrop: (e: React.DragEvent) => onDrop(e, date),
  });

  const chip = (t: CalTask, big = false) => {
    const p = PRIORITY[t.priority] ?? PRIORITY.MEDIUM;
    const done = t.status === "DONE";
    return (
      <Link
        key={t.id}
        href={taskHref(t.id, back)}
        draggable={t.editable}
        onDragStart={(e) => t.editable && e.dataTransfer.setData("text/task-id", String(t.id))}
        title={`${t.title}${t.assigneeName ? ` — ${t.assigneeName}` : ""}${t.projectName ? ` · ${t.projectName}` : ""} · ${p.label}${t.overdue ? " · overdue" : ""}${
          t.editable ? " · drag to reschedule" : ""
        }`}
        className={`group/chip flex items-center gap-1.5 rounded-md border-l-[3px] px-1.5 py-1 text-[11px] leading-tight transition hover:shadow-sm ${
          done
            ? "border-l-emerald-400 bg-slate-50 text-slate-400 dark:bg-slate-800/60"
            : t.overdue
              ? `${p.bar} bg-red-50 font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300`
              : `${p.bar} bg-white font-medium text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700`
        } ${t.editable ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        {done && <span className="text-emerald-500">✓</span>}
        <span className={`min-w-0 flex-1 ${big ? "line-clamp-2" : "truncate"} ${done ? "line-through" : ""}`}>{t.title}</span>
        {showAssignee && t.assigneeName && (
          <span className="shrink-0 rounded bg-slate-200/70 px-1 text-[9px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300" title={t.assigneeName}>
            {initials(t.assigneeName)}
          </span>
        )}
      </Link>
    );
  };

  const markChips = (d: string, max = 2) => {
    const ms = marksOn(d);
    return (
      <>
        {ms.slice(0, max).map((m, k) => (
          <div
            key={k}
            title={m.title ?? m.label}
            className={`truncate rounded px-1.5 py-0.5 text-[10px] ${
              m.kind === "holiday"
                ? "bg-amber-100 font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                : "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
            }`}
          >
            {m.kind === "holiday" ? "🎉" : "🌴"} {m.label}
          </div>
        ))}
        {ms.length > max && <div className="text-[10px] text-slate-400">+{ms.length - max} off</div>}
      </>
    );
  };

  return (
    <>
      {view !== "agenda" && tray.length > 0 && (
        <div className="card p-3">
          <button type="button" onClick={() => setTrayOpen((o) => !o)} className="flex w-full items-center justify-between text-left text-sm">
            <span>
              <b>📥 No due date</b> <span className="text-slate-500">({tray.length}) — drag one onto a day to schedule it</span>
            </span>
            <span className="text-slate-400">{trayOpen ? "▾" : "▸"}</span>
          </button>
          {trayOpen && (
            <div className="mt-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {tray.map((t) => (
                <div key={t.id} className="w-56 max-w-full">
                  {chip(t)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "agenda" ? (
        <Agenda days={days} byDay={byDay} marksOn={marksOn} chipBack={back} showAssignee={showAssignee} onMove={move} onOpen={(d) => setOpenDay({ date: d, add: true })} />
      ) : (
        <>
          <p className="text-xs text-slate-500 lg:hidden">← Swipe sideways to see the whole week · or use Agenda view →</p>
          <div className={`card overflow-x-auto ${isPending ? "opacity-90" : ""}`}>
            <div className="grid min-w-[840px] grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
              {(view === "week" ? days : days.slice(0, 7)).map((d, i) => (
                <div key={d.date} className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${d.weekend ? "text-slate-400" : "text-slate-500"}`}>
                  {WEEKDAYS[i]}
                  {view === "week" && (
                    <span className={`ml-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm ${d.today ? "bg-sky-600 text-white" : "text-slate-700 dark:text-slate-200"}`}>
                      {dayNum(d.date)}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="grid min-w-[840px] grid-cols-7">
              {days.map((d) => {
                const list = byDay.get(d.date) ?? [];
                const limit = view === "week" ? Infinity : MONTH_CHIPS;
                return (
                  <div
                    key={d.date}
                    {...dropProps(d.date)}
                    className={`group relative flex flex-col gap-1 border-b border-r border-slate-100 p-1.5 transition-colors dark:border-slate-800 ${
                      view === "week" ? "min-h-[55vh]" : "min-h-32"
                    } ${
                      dragOver === d.date
                        ? "bg-sky-100 dark:bg-sky-900/40"
                        : d.today
                          ? "bg-sky-50/70 dark:bg-sky-950/30"
                          : !d.inMonth
                            ? "bg-slate-50/80 dark:bg-slate-900/40"
                            : d.weekend
                              ? "bg-slate-50/50 dark:bg-slate-900/20"
                              : ""
                    }`}
                  >
                    {view === "month" && (
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setOpenDay({ date: d.date, add: false })}
                          className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium hover:ring-1 hover:ring-slate-300 ${
                            d.today ? "bg-sky-600 text-white" : !d.inMonth ? "text-slate-300 dark:text-slate-600" : d.past ? "text-slate-400" : "text-slate-600 dark:text-slate-300"
                          }`}
                          title="Open this day"
                        >
                          {dayNum(d.date) === 1 && !d.today ? `${MONTHS[Number(d.date.slice(5, 7)) - 1]} 1` : dayNum(d.date)}
                        </button>
                        <AddBtn onClick={() => setOpenDay({ date: d.date, add: true })} />
                      </div>
                    )}
                    <div className={!d.inMonth ? "opacity-60" : ""}>{markChips(d.date, view === "week" ? 5 : 2)}</div>
                    <div className={`space-y-1 ${!d.inMonth ? "opacity-60" : ""}`}>{list.slice(0, limit).map((t) => chip(t, view === "week"))}</div>
                    {list.length > limit && (
                      <button
                        type="button"
                        onClick={() => setOpenDay({ date: d.date, add: false })}
                        className="rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40"
                      >
                        +{list.length - limit} more
                      </button>
                    )}
                    {view === "week" && (
                      <button
                        type="button"
                        onClick={() => setOpenDay({ date: d.date, add: true })}
                        className="mt-auto rounded-md border border-dashed border-slate-200 py-1 text-xs text-slate-400 opacity-0 transition hover:border-sky-400 hover:text-sky-600 group-hover:opacity-100 dark:border-slate-700"
                      >
                        ＋ Add task
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <Legend />
        </>
      )}

      {openDay && (
        <DayPanel
          date={openDay.date}
          focusAdd={openDay.add}
          tasks={byDay.get(openDay.date) ?? []}
          marks={marksOn(openDay.date)}
          back={back}
          people={people}
          defaultAssignee={defaultAssignee}
          onClose={() => setOpenDay(null)}
          onMove={(id, iso) => move(id, iso || null)}
          onAdded={() => router.refresh()}
        />
      )}
    </>
  );
}

function AddBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-full text-base leading-none text-slate-400 opacity-0 transition hover:bg-sky-100 hover:text-sky-700 focus:opacity-100 group-hover:opacity-100 dark:hover:bg-sky-900/40"
      title="Add a task on this day"
      aria-label="Add a task on this day"
    >
      ＋
    </button>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
      {Object.entries(PRIORITY).map(([k, p]) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${p.dot}`} /> {p.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-red-100 ring-1 ring-red-300" /> Overdue
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-emerald-500">✓</span> Done
      </span>
      <span>🎉 Holiday</span>
      <span>🌴 On leave</span>
    </div>
  );
}

function Agenda({
  days,
  byDay,
  marksOn,
  chipBack,
  showAssignee,
  onMove,
  onOpen,
}: {
  days: CalDay[];
  byDay: Map<string, CalTask[]>;
  marksOn: (d: string) => CalMark[];
  chipBack: string;
  showAssignee: boolean;
  onMove: (id: number, iso: string | null) => void;
  onOpen: (d: string) => void;
}) {
  const shown = days.filter((d) => d.today || (byDay.get(d.date)?.length ?? 0) > 0 || marksOn(d.date).length > 0);
  if (!shown.length) return <div className="card py-12 text-center text-sm text-slate-400">Nothing due this month.</div>;
  return (
    <div className="card divide-y divide-slate-100 dark:divide-slate-800">
      {shown.map((d) => {
        const list = byDay.get(d.date) ?? [];
        return (
          <div key={d.date} className={`flex flex-col gap-2 p-4 sm:flex-row ${d.today ? "bg-sky-50/60 dark:bg-sky-950/20" : ""}`}>
            <div className="w-32 shrink-0">
              <div className={`text-sm font-semibold ${d.past && !d.today ? "text-slate-400" : ""}`}>{shortDate(d.date)}</div>
              {d.today && <span className="badge bg-sky-600 text-white">Today</span>}
              <button type="button" onClick={() => onOpen(d.date)} className="mt-1 block text-xs text-sky-600 hover:underline">
                ＋ Add task
              </button>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {marksOn(d.date).map((m, k) => (
                <div key={k} className="text-xs text-slate-500" title={m.title}>
                  {m.kind === "holiday" ? "🎉" : "🌴"} {m.title ?? m.label}
                </div>
              ))}
              {list.length === 0 && marksOn(d.date).length === 0 && <div className="text-sm text-slate-400">Nothing due.</div>}
              {list.map((t) => {
                const p = PRIORITY[t.priority] ?? PRIORITY.MEDIUM;
                const s = STATUS[t.status] ?? STATUS.TODO;
                return (
                  <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.dot}`} title={p.label} />
                    <Link
                      href={taskHref(t.id, chipBack)}
                      className={`min-w-0 flex-1 truncate text-sm font-medium hover:text-sky-600 ${t.status === "DONE" ? "text-slate-400 line-through" : t.overdue ? "text-red-600" : ""}`}
                    >
                      {t.title}
                    </Link>
                    {t.projectName && <span className="hidden truncate text-xs text-slate-400 md:inline">{t.projectName}</span>}
                    {showAssignee && t.assigneeName && <span className="text-xs text-slate-500">{t.assigneeName}</span>}
                    <span className={`badge ${s.cls}`}>{t.overdue ? "Overdue" : s.label}</span>
                    {t.editable && <DatePicker compact title="Move to another date" defaultValue={d.date} onPick={(v) => onMove(t.id, v || null)} />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayPanel({
  date,
  focusAdd,
  tasks,
  marks,
  back,
  people,
  defaultAssignee,
  onClose,
  onMove,
  onAdded,
}: {
  date: string;
  focusAdd: boolean;
  tasks: CalTask[];
  marks: CalMark[];
  back: string;
  people: { id: number; name: string }[];
  defaultAssignee: number;
  onClose: () => void;
  onMove: (id: number, iso: string) => void;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [assignee, setAssignee] = useState(String(defaultAssignee));
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [busy, startBusy] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusAdd) inputRef.current?.focus();
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [focusAdd, onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setError(null);
    startBusy(async () => {
      const r = await createTaskOnDay(t, date, { assigneeId: Number(assignee) || null, priority });
      if (!r.ok) return setError(r.error);
      setAdded((a) => [...a, t]);
      setTitle("");
      onAdded();
      inputRef.current?.focus();
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 py-[8vh]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={longDate(date)} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{longDate(date)}</h3>
            <p className="text-xs text-slate-400">
              {tasks.length} task{tasks.length === 1 ? "" : "s"}
              {tasks.length > 0 && " · use 📅 to move one"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            ✕
          </button>
        </div>

        {marks.length > 0 && (
          <div className="mb-3 space-y-1">
            {marks.map((m, k) => (
              <div key={k} className="text-xs text-slate-500">
                {m.kind === "holiday" ? "🎉" : "🌴"} {m.title ?? m.label}
              </div>
            ))}
          </div>
        )}

        <div className="max-h-[40vh] space-y-1 overflow-y-auto">
          {tasks.map((t) => {
            const p = PRIORITY[t.priority] ?? PRIORITY.MEDIUM;
            const s = STATUS[t.status] ?? STATUS.TODO;
            return (
              <div key={t.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/60">
                <span className={`h-2 w-2 shrink-0 rounded-full ${p.dot}`} title={p.label} />
                <Link
                  href={taskHref(t.id, back)}
                  onClick={onClose}
                  title={t.assigneeName ? `${t.title} — ${t.assigneeName}` : t.title}
                  className={`min-w-0 flex-1 truncate ${t.status === "DONE" ? "text-slate-400 line-through" : t.overdue ? "text-red-600" : ""}`}
                >
                  {t.title}
                </Link>
                {t.assigneeName && <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">{t.assigneeName.split(" ")[0]}</span>}
                <span className={`badge shrink-0 ${s.cls}`}>{s.label}</span>
                {t.editable && (
                  <DatePicker
                    compact
                    title="Move to another date"
                    defaultValue={date}
                    onPick={(v) => {
                      onMove(t.id, v);
                      onClose();
                    }}
                  />
                )}
              </div>
            );
          })}
          {added.map((a, i) => (
            <div key={`n${i}`} className="flex items-center gap-2 rounded-md bg-emerald-50 px-2 py-1.5 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              ✓ Added: <span className="truncate">{a}</span>
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="mt-4 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-700">
          <label className="label" htmlFor="cal-add">
            Add a task due this day
          </label>
          <input
            id="cal-add"
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            placeholder="What needs doing?"
            className="input"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input !w-auto !py-1.5 text-sm" aria-label="Priority">
              {Object.entries(PRIORITY).map(([k, p]) => (
                <option key={k} value={k}>
                  {p.label}
                </option>
              ))}
            </select>
            {people.length > 0 && (
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="input !w-auto min-w-0 flex-1 !py-1.5 text-sm" aria-label="Assign to">
                {people.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
            <button type="submit" disabled={busy || !title.trim()} className="btn-primary !py-1.5 text-sm disabled:opacity-50">
              {busy ? "Adding…" : "Add"}
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </form>
      </div>
    </div>
  );
}
