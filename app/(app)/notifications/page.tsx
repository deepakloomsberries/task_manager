import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { markAllNotificationsRead, toggleNotificationRead } from "@/lib/actions/notifications";
import { fmtDateTime } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-slate-500">
            {unread > 0 ? `${unread} unread` : "You're all caught up."}
          </p>
        </div>
        <div className="flex gap-2">
          {unread > 0 && (
            <form action={markAllNotificationsRead}>
              <button type="submit" className="btn-secondary">
                Mark all as read
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="card divide-y divide-slate-100">
        {notifications.length === 0 && (
          <p className="py-16 text-center text-sm text-slate-400">No notifications yet.</p>
        )}
        {notifications.map((n) => (
          <div key={n.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50">
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                n.read ? "bg-transparent" : "bg-sky-500"
              }`}
            />
            <div className="min-w-0 flex-1">
              {n.link ? (
                <Link href={n.link} className="hover:underline">
                  <p className={`text-sm ${n.read ? "text-slate-500" : "font-medium text-slate-800"}`}>
                    {n.message}
                  </p>
                </Link>
              ) : (
                <p className={`text-sm ${n.read ? "text-slate-500" : "font-medium text-slate-800"}`}>
                  {n.message}
                </p>
              )}
              <p className="text-xs text-slate-400">{fmtDateTime(n.createdAt)}</p>
            </div>
            <form action={toggleNotificationRead}>
              <input type="hidden" name="id" value={n.id} />
              <button
                type="submit"
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40"
              >
                {n.read ? "Mark unread" : "Mark read"}
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
