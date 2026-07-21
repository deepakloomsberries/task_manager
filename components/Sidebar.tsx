"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; icon: string };

const MAIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/my-tasks", label: "My Tasks", icon: "◎" },
  { href: "/tasks", label: "Tasks", icon: "☑" },
  { href: "/projects", label: "Projects", icon: "▤" },
  { href: "/calendar", label: "Calendar", icon: "▧" },
  { href: "/discussion", label: "Discussion", icon: "◈" },
  { href: "/documents", label: "Documents", icon: "▣" },
  { href: "/timesheet", label: "Time sheet", icon: "◷" },
  { href: "/notes", label: "Notes", icon: "✎" },
  { href: "/reports", label: "Reports", icon: "▙" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/users", label: "Users", icon: "◉" },
  { href: "/departments", label: "Departments", icon: "⌂" },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-sky-50 text-sky-700"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <span className="w-5 text-center text-base leading-none">{item.icon}</span>
      {item.label}
    </Link>
  );
}

export default function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5">
        <span className="text-lg font-bold">
          Looms <span className="text-sky-600">&amp;</span> Berries
        </span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {MAIN_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
        {isAdmin && (
          <>
            <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Admin
            </div>
            {ADMIN_NAV.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} />
            ))}
          </>
        )}
        <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Account
        </div>
        <NavLink
          item={{ href: "/settings", label: "Settings", icon: "⚙" }}
          active={isActive("/settings")}
        />
      </nav>
    </aside>
  );
}
