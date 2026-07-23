import SidebarNav, { Brand } from "@/components/SidebarNav";

/** Desktop sidebar — hidden on small screens (see MobileSidebar for mobile). */
export default function Sidebar({
  isAdmin,
  isManager,
  unreadMessages = 0,
}: {
  isAdmin: boolean;
  isManager: boolean;
  unreadMessages?: number;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex dark:border-slate-700 dark:bg-slate-800">
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-5 dark:border-slate-700">
        <Brand />
      </div>
      <SidebarNav isAdmin={isAdmin} isManager={isManager} unreadMessages={unreadMessages} />
    </aside>
  );
}
