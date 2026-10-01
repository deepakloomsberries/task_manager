import { cookies } from "next/headers";
import { SidebarProvider, DesktopSidebar, SidebarToggle } from "@/components/SidebarState";
import MobileSidebar from "@/components/MobileSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import StatusMenu from "@/components/StatusMenu";
import SetupGate from "@/components/SetupGate";
import Heartbeat from "@/components/Heartbeat";
import HelpMenu from "@/components/HelpMenu";
import LongTimerPrompt from "@/components/LongTimerPrompt";
import RunningTimerPill from "@/components/RunningTimerPill";
import PushSetup from "@/components/PushSetup";
import CommandPalette, { CommandButton } from "@/components/CommandPalette";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { logout } from "@/lib/actions/auth";
import { reapStaleTimers } from "@/lib/timers";
import { adminTwoStepRequired } from "@/lib/twoFactor";
import { todayIn } from "@/lib/leave";
import { companyTimezone } from "@/lib/tz";
import TeamPresence from "@/components/TeamPresence";
import NotificationBell from "@/components/NotificationBell";
import { loadTeamPresence } from "@/lib/teamPresence";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Before anything else can be used: a first-login password change, and
  // (for admins) two-step sign-in. <SetupGate> shows a "go to Settings" panel
  // on other pages (a redirect from here loops in Next 15 — every background
  // prefetch of a sidebar link hits it).
  const gate: "password" | "two-step" | null = user.mustChangePassword
    ? "password"
    : user.role === "ADMIN" && !user.totpEnabled && adminTwoStepRequired()
      ? "two-step"
      : null;

  // Tasks assigned to me that need attention now — overdue or due by end of today.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // Stop timers left running on a closed browser / shut-down laptop.
  await reapStaleTimers();

  const todayDate = new Date(`${todayIn(companyTimezone(user.company))}T00:00:00Z`);
  const isApprover = user.role === "ADMIN" || user.role === "MANAGER";
  const [unread, unreadMessages, activeTimer, myTasksDue, pendingLeave, onLeaveToday, team] =
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
      isApprover ? db.leave.count({ where: { status: "PENDING", userId: { not: user.id } } }) : Promise.resolve(0),
      db.leave
        .count({ where: { userId: user.id, status: "APPROVED", startDate: { lte: todayDate }, endDate: { gte: todayDate } } })
        .then((n) => n > 0),
      loadTeamPresence(user.id),
    ]);

  const navBadges: Record<string, number> = {
    "/messages": unreadMessages,
    "/my-tasks": myTasksDue,
    "/notifications": unread,
    "/leave": pendingLeave,
  };

  const isAdmin = user.role === "ADMIN";
  const isManager = user.role === "ADMIN" || user.role === "MANAGER";
  const sidebarCollapsed = (await cookies()).get("sidebar")?.value === "collapsed";

  return (
    <SidebarProvider initialCollapsed={sidebarCollapsed}>
    <div className="flex h-screen">
      <Heartbeat />
      <PushSetup />
      <CommandPalette />
      <DesktopSidebar isAdmin={isAdmin} isManager={isManager} badges={navBadges} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 print:hidden sm:gap-4 sm:px-6 dark:border-slate-700 dark:bg-slate-800">
          <SidebarToggle />
          <MobileSidebar isAdmin={isAdmin} isManager={isManager} badges={navBadges} />
          <CommandButton />
          <div className="flex min-w-0 flex-1 items-center">
            <TeamPresence initial={team} />
          </div>
          {activeTimer && (
            <RunningTimerPill
              taskId={activeTimer.task.id}
              title={activeTimer.task.title}
              startedAt={activeTimer.startedAt.toISOString()}
            />
          )}
          <ThemeToggle />
          <HelpMenu />
          <NotificationBell initialUnread={unread} />
          <StatusMenu
            user={{ id: user.id, name: user.name, avatarPath: user.avatarPath }}
            subtitle={`${user.company.code} · ${user.role.toLowerCase()}`}
            presence={{
              presence: user.presence,
              presenceText: user.presenceText,
              presenceUntil: user.presenceUntil?.toISOString() ?? null,
              onLeave: onLeaveToday,
            }}
          />
          <form action={logout}>
            <button type="submit" className="btn-secondary !px-2.5 !py-1.5 text-xs sm:!px-3">
              <span className="hidden sm:inline">Sign out</span>
              <span aria-hidden className="sm:hidden">⎋</span>
            </button>
          </form>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6"><SetupGate kind={gate}>{children}</SetupGate></main>
        {activeTimer && (
          <LongTimerPrompt
            taskId={activeTimer.task.id}
            title={activeTimer.task.title}
            startedAt={activeTimer.startedAt.toISOString()}
          />
        )}
      </div>
    </div>
    </SidebarProvider>
  );
}

