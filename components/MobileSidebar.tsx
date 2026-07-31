"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import SidebarNav, { Brand } from "@/components/SidebarNav";

/**
 * Hamburger button + slide-in navigation drawer for small screens. The button
 * renders inline (place it in the header); the drawer is a fixed overlay so its
 * position in the DOM doesn't matter. Closes on navigation.
 */
export default function MobileSidebar({
  isAdmin,
  isManager,
  badges = {},
}: {
  isAdmin: boolean;
  isManager: boolean;
  badges?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const hasUnread = Object.values(badges).some((n) => n > 0);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent the page behind the drawer from scrolling while it is open.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-700"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        {hasUnread && (
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-sky-600 ring-2 ring-white dark:ring-slate-800" />
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 max-w-[80%] flex-col border-r border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-5 dark:border-slate-700">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                ✕
              </button>
            </div>
            <SidebarNav
              isAdmin={isAdmin}
              isManager={isManager}
              badges={badges}
              onNavigate={() => setOpen(false)}
            />
          </aside>
        </div>
      )}
    </>
  );
}
