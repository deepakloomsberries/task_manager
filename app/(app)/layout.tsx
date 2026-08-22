import Link from "next/link";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SidebarProvider, DesktopSidebar, SidebarToggle } from "@/components/SidebarState";
import MobileSidebar from "@/components/MobileSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import UserAvatar from "@/components/UserAvatar";
import Heartbeat from "@/components/Heartbeat";
import RunningTimerPill from "@/components/RunningTimerPill";
import PushSetup from "@/components/PushSetup";
import CommandPalette, { CommandButton } from "@/components/CommandPalette";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Force a password change before any part of the app can be explored.
  // Guard on a known path only, so a missing header can never cause a loop.
  const pathname = headers().get("x-pathname") ?? "";
  if (user.mustChangePassword && pathname && !pathname.startsWith("/settings")) {
    redirect("/settings?first=1");
  }

  // Tasks assigned to me that need attention now — overdue or due by end of today.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const [unread, unreadMessages, activeTimer, myTasksDue, paletteUsers, paletteProjects] =
    await Promise.all([
      db.notification.count({ where: { userId: user.id, read: false } }),
      db.directMessage.count({ where: { recipientId: user.id, read: false } }),
      db.taskTimer.findUnique({
        where: { userId: user.id },
        include: { task: { select: { id: true, title: true } } },
      }),
      db.task.count({
        where: {
          deletedAt: null,
          status: { not: "DONE" },
          dueDate: { not: null, lte: endOfToday },
          OR: [{ assigneeId: user.id }, { collaborators: { some: { userId: user.id } } }],
        },
      }),
      db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      db.project.findMany({
        where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

  const navBadges: Record<string, number> = {
    "/messages": unreadMessages,
    "/my-tasks": myTasksDue,
    "/notifications": unread,
  };

  const isAdmin = user.role === "ADMIN";
  const isManager = user.role === "ADMIN" || user.role === "MANAGER";
  const sidebarCollapsed = cookies().get("sidebar")?.value === "collapsed";

  return (
    <SidebarProvider initialCollapsed={sidebarCollapsed}>
    <div className="flex h-screen">
      <Heartbeat />
      <PushSetup />
      <CommandPalette users={paletteUsers} projects={paletteProjects} />
      <DesktopSidebar isAdmin={isAdmin} isManager={isManager} badges={navBadges} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:gap-4 sm:px-6 dark:border-slate-700 dark:bg-slate-800">
          <SidebarToggle />
          <MobileSidebar isAdmin={isAdmin} isManager={isManager} badges={navBadges} />
          <CommandButton />
          <div className="hidden flex-1 sm:block" />
          {activeTimer && (
            <RunningTimerPill
              taskId={activeTimer.task.id}
              title={activeTimer.task.title}
              startedAt={activeTimer.startedAt.toISOString()}
            />
          )}
          <ThemeToggle />
          <Link
            href="/notifications"
            className="relative rounded-lg p-2 text-xl leading-none text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
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
          <Link href="/settings" className="flex items-center gap-3" title="Profile settings">
            <UserAvatar user={user} size={36} />
            <div className="hidden leading-tight sm:block">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {user.company.code} · {user.role.toLowerCase()}
              </div>
            </div>
          </Link>
          <form action={logout}>
            <button type="submit" className="btn-secondary !px-2.5 !py-1.5 text-xs sm:!px-3">
              <span className="hidden sm:inline">Sign out</span>
              <span aria-hidden className="sm:hidden">⎋</span>
            </button>
          </form>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
    </SidebarProvider>
  );
}
