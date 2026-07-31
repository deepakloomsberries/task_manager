import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  markAllNotificationsRead,
  toggleNotificationRead,
  markThreadRead,
  clearNotifications,
} from "@/lib/actions/notifications";
import { fmtRelative } from "@/lib/ui";

export const dynamic = "force-dynamic";

type Notif = { id: number; message: string; link: string | null; read: boolean; createdAt: Date };
type Group = { key: string; title: string; icon: string; href: string | null; items: Notif[]; unread: number };

/** Normalises a link to a stable thread key (strips query/hash). */
function pathOf(link: string | null) {
  return link ? link.split(/[?#]/)[0] : "";
}

export default async function InboxPage({ searchParams }: { searchParams: { filter?: string } }) {
  const user = await requireUser();
  const onlyUnread = searchParams.filter === "unread";
  const backHref = onlyUnread ? "/notifications?filter=unread" : "/notifications";

  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id, ...(onlyUnread ? { read: false } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.notification.count({ where: { userId: user.id, read: false } }),
  ]);

  // Resolve friendly thread titles for the entities the notifications point at.
  const taskIds = new Set<number>();
  const projectIds = new Set<number>();
  const dmUserIds = new Set<number>();
  for (const n of notifications) {
    const p = pathOf(n.link);
    let m: RegExpMatchArray | null;
    if ((m = p.match(/^\/tasks\/(\d+)$/))) taskIds.add(Number(m[1]));
    else if ((m = p.match(/^\/projects\/(\d+)$/))) projectIds.add(Number(m[1]));
    else if ((m = p.match(/^\/messages\/(\d+)$/))) dmUserIds.add(Number(m[1]));
  }
  const [tasks, projects, dmUsers] = await Promise.all([
    taskIds.size ? db.task.findMany({ where: { id: { in: Array.from(taskIds) } }, select: { id: true, title: true } }) : [],
    projectIds.size ? db.project.findMany({ where: { id: { in: Array.from(projectIds) } }, select: { id: true, name: true } }) : [],
    dmUserIds.size ? db.user.findMany({ where: { id: { in: Array.from(dmUserIds) } }, select: { id: true, name: true } }) : [],
  ]);
  const taskMap = new Map(tasks.map((t) => [t.id, t.title]));
  const projMap = new Map(projects.map((p) => [p.id, p.name]));
  const dmMap = new Map(dmUsers.map((u) => [u.id, u.name]));

  function threadInfo(link: string | null): { key: string; title: string; icon: string; href: string | null } {
    const p = pathOf(link);
    let m: RegExpMatchArray | null;
    if ((m = p.match(/^\/tasks\/(\d+)$/)))
      return { key: p, title: taskMap.get(Number(m[1])) ?? `Task TM-${m[1]}`, icon: "☑", href: link };
    if ((m = p.match(/^\/projects\/(\d+)$/)))
      return { key: p, title: projMap.get(Number(m[1])) ?? "Project", icon: "▤", href: link };
    if ((m = p.match(/^\/messages\/(\d+)$/)))
      return { key: p, title: `Chat with ${dmMap.get(Number(m[1])) ?? "teammate"}`, icon: "✉", href: link };
    if (p.startsWith("/timesheet")) return { key: "/timesheet", title: "Time sheet", icon: "◷", href: link };
    if (!link) return { key: "general", title: "General", icon: "•", href: null };
    return { key: p, title: p, icon: "•", href: link };
  }

  const order: string[] = [];
  const groups = new Map<string, Group>();
  for (const n of notifications) {
    const info = threadInfo(n.link);
    let g = groups.get(info.key);
    if (!g) {
      g = { key: info.key, title: info.title, icon: info.icon, href: info.href, items: [], unread: 0 };
      groups.set(info.key, g);
      order.push(info.key);
    }
    g.items.push(n);
    if (!n.read) g.unread += 1;
  }
  const grouped = order.map((k) => groups.get(k)!);

  const Tab = ({ label, href, activeTab }: { label: string; href: string; activeTab: boolean }) => (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-sm font-medium ${
        activeTab ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inbox</h1>
          <p className="text-sm text-slate-500">
            {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <form action={markAllNotificationsRead}>
              <input type="hidden" name="back" value={backHref} />
              <button type="submit" className="btn-secondary !py-1.5 text-xs">Mark all read</button>
            </form>
          )}
          {notifications.length > 0 && (
            <form action={clearNotifications}>
              <input type="hidden" name="back" value={backHref} />
              <button type="submit" className="btn-secondary !py-1.5 text-xs text-red-600">Clear all</button>
            </form>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Tab label="All" href="/notifications" activeTab={!onlyUnread} />
        <Tab label={`Unread${unreadCount ? ` (${unreadCount})` : ""}`} href="/notifications?filter=unread" activeTab={onlyUnread} />
      </div>

      {grouped.length === 0 && (
        <div className="card py-16 text-center text-sm text-slate-400">
          {onlyUnread ? "No unread notifications." : "No notifications yet."}
        </div>
      )}

      <div className="space-y-3">
        {grouped.map((g) => (
          <div key={g.key} className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
              <span className="w-5 text-center text-slate-400">{g.icon}</span>
              {g.href ? (
                <Link href={g.href} className="flex-1 truncate text-sm font-semibold hover:text-sky-700">
                  {g.title}
                </Link>
              ) : (
                <span className="flex-1 truncate text-sm font-semibold">{g.title}</span>
              )}
              {g.unread > 0 && (
                <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white">{g.unread}</span>
              )}
              {g.unread > 0 && (
                <form action={markThreadRead}>
                  <input type="hidden" name="link" value={g.href ?? ""} />
                  <input type="hidden" name="back" value={backHref} />
                  <button type="submit" className="text-xs text-slate-400 hover:text-sky-600" title="Mark thread read">
                    ✓
                  </button>
                </form>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {g.items.map((n) => (
                <div key={n.id} className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 ${n.read ? "" : "bg-sky-50/40 dark:bg-sky-950/20"}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-sky-500"}`} />
                  <div className="min-w-0 flex-1">
                    {n.link ? (
                      <Link href={n.link} className={`text-sm hover:underline ${n.read ? "text-slate-500" : "font-medium text-slate-800 dark:text-slate-100"}`}>
                        {n.message}
                      </Link>
                    ) : (
                      <p className={`text-sm ${n.read ? "text-slate-500" : "font-medium text-slate-800 dark:text-slate-100"}`}>{n.message}</p>
                    )}
                    <p className="text-xs text-slate-400">{fmtRelative(n.createdAt)}</p>
                  </div>
                  <form action={toggleNotificationRead}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="back" value={backHref} />
                    <button type="submit" className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40">
                      {n.read ? "Unread" : "Read"}
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
