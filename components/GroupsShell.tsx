"use client";

import { usePathname } from "next/navigation";

/**
 * Same WhatsApp-style two-pane layout as MessagesShell: group list on the
 * left, active group thread on the right, both visible on desktop. On a
 * narrow screen only one shows at a time — list at /discussion, thread once
 * a group is open (/discussion/[groupId]).
 */
export default function GroupsShell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const hasActiveGroup = pathname !== "/discussion";

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[420px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <div
        className={`${hasActiveGroup ? "hidden md:flex" : "flex"} w-full flex-col border-r border-slate-200 md:w-[360px] md:shrink-0 dark:border-slate-700`}
      >
        {sidebar}
      </div>
      <div className={`${hasActiveGroup ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>{children}</div>
    </div>
  );
}
