"use client";

import { createContext, useContext, useState } from "react";
import SidebarNav, { Brand } from "@/components/SidebarNav";

type Ctx = { collapsed: boolean; toggle: () => void };
const SidebarCtx = createContext<Ctx>({ collapsed: false, toggle: () => {} });

/** Holds the desktop sidebar's collapsed state, persisted in a cookie so the
 *  server can render the correct width on the next load (no flash of the wrong
 *  layout). */
export function SidebarProvider({
  initialCollapsed,
  children,
}: {
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      document.cookie = `sidebar=${next ? "collapsed" : "expanded"};path=/;max-age=31536000`;
      return next;
    });
  return <SidebarCtx.Provider value={{ collapsed, toggle }}>{children}</SidebarCtx.Provider>;
}

/** Collapse/expand the desktop sidebar. Shows a chevron that points the way the
 *  panel will move — left to hide, right to reveal. */
export function SidebarToggle() {
  const { collapsed, toggle } = useContext(SidebarCtx);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
      title={collapsed ? "Show sidebar" : "Hide sidebar"}
      className="hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:inline-flex dark:text-slate-300 dark:hover:bg-slate-700"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16" />
        {collapsed ? <path d="M13 9l3 3-3 3" /> : <path d="M16 9l-3 3 3 3" />}
      </svg>
    </button>
  );
}

/** Desktop sidebar that collapses to zero width when toggled off. */
export function DesktopSidebar({
  isAdmin,
  isManager,
  badges = {},
}: {
  isAdmin: boolean;
  isManager: boolean;
  badges?: Record<string, number>;
}) {
  const { collapsed } = useContext(SidebarCtx);
  return (
    <aside
      className={`hidden shrink-0 flex-col border-slate-200 bg-white transition-[width] duration-200 print:hidden md:flex dark:border-slate-700 dark:bg-slate-800 ${
        collapsed ? "md:w-0 md:overflow-hidden md:border-r-0" : "w-60 border-r"
      }`}
    >
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5 dark:border-slate-700">
        <Brand />
      </div>
      <SidebarNav isAdmin={isAdmin} isManager={isManager} badges={badges} />
    </aside>
  );
}
