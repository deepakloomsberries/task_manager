import Link from "next/link";

/** Tabs shared by the three leave pages. */
export default function LeaveTabs({ active, isManager, pending }: { active: "mine" | "team" | "holidays"; isManager: boolean; pending?: number }) {
  const tabs = [
    { key: "mine", href: "/leave", label: "My leave" },
    ...(isManager ? [{ key: "team", href: "/leave/team", label: "Team" }] : []),
    { key: "holidays", href: "/leave/holidays", label: "Holidays" },
  ];
  return (
    <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
            active === t.key
              ? "border-sky-600 text-sky-700 dark:text-sky-300"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          }`}
        >
          {t.label}
          {t.key === "team" && pending ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">{pending}</span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
