import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { initials } from "@/lib/ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await db.notification.count({ where: { userId: user.id, read: false } });

  return (
    <div className="flex h-screen">
      <Sidebar isAdmin={user.role === "ADMIN"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6">
          <form action="/search" method="GET" className="max-w-md flex-1">
            <input
              name="q"
              placeholder="Search tasks, projects, documents…"
              className="input !bg-slate-50"
            />
          </form>
          <div className="flex-1" />
          <Link
            href="/notifications"
            className="relative rounded-lg p-2 text-xl leading-none text-slate-500 hover:bg-slate-100"
            title="Notifications"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-sm font-semibold text-white">
              {initials(user.name)}
            </div>
            <div className="leading-tight">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-slate-500">
                {user.company.code} · {user.role.toLowerCase()}
              </div>
            </div>
          </div>
          <form action={logout}>
            <button type="submit" className="btn-secondary !px-3 !py-1.5 text-xs">
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
