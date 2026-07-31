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
  { href: "/notifications", label: "Inbox", icon: "✦" },
  { href: "/messages", label: "Messages", icon: "✉" },
  { href: "/documents", label: "Documents", icon: "▣" },
  { href: "/timesheet", label: "Time sheet", icon: "◷" },
  { href: "/notes", label: "Notes", icon: "✎" },
  { href: "/reports", label: "Reports", icon: "▙" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/users", label: "Users", icon: "◉" },
  { href: "/departments", label: "Departments", icon: "⌂" },
];

function NavLink({
  item,
  active,
  badge,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  badge?: number;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700"
      }`}
    >
      <span className="w-5 text-center text-base leading-none">{item.icon}</span>
      <span className="flex-1">{item.label}</span>
      {badge ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-600 px-1.5 text-[10px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

export default function SidebarNav({
  isAdmin,
  isManager,
  badges = {},
  onNavigate,
}: {
  isAdmin: boolean;
  isManager: boolean;
  /** Per-route unread/attention counts keyed by href, e.g. { "/messages": 3 }. */
  badges?: Record<string, number>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {MAIN_NAV.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          active={isActive(item.href)}
          badge={badges[item.href]}
          onNavigate={onNavigate}
        />
      ))}
      {isManager && (
        <>
          <NavLink
            item={{ href: "/workload", label: "Workload", icon: "▚" }}
            active={isActive("/workload")}
            onNavigate={onNavigate}
          />
          <NavLink
            item={{ href: "/templates", label: "Templates", icon: "❏" }}
            active={isActive("/templates")}
            onNavigate={onNavigate}
          />
        </>
      )}
      {isAdmin && (
        <>
          <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Admin
          </div>
          {ADMIN_NAV.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} onNavigate={onNavigate} />
          ))}
          <NavLink
            item={{ href: "/trash", label: "Recycle bin", icon: "♺" }}
            active={isActive("/trash")}
            onNavigate={onNavigate}
          />
        </>
      )}
      <div className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Account
      </div>
      <NavLink
        item={{ href: "/settings", label: "Settings", icon: "⚙" }}
        active={isActive("/settings")}
        onNavigate={onNavigate}
      />
    </nav>
  );
}

export function Brand() {
  return (
    <span className="text-lg font-bold">
      Looms <span className="text-sky-600">&amp;</span> Berries
    </span>
  );
}
