"use client";

import { usePathname } from "next/navigation";

/**
 * WhatsApp-style two-pane layout: chat list on the left, active thread on
 * the right, both visible at once on desktop. On a narrow screen there's
 * only room for one — show the list at /messages, and swap to just the
 * thread once a chat is open (/messages/[id]), matching how WhatsApp's own
 * mobile view behaves.
 */
export default function MessagesShell({ sidebar, children }: { sidebar: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname();
  const hasActiveChat = pathname !== "/messages";

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[420px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <div
        className={`${hasActiveChat ? "hidden md:flex" : "flex"} w-full flex-col border-r border-slate-200 md:w-[360px] md:shrink-0 dark:border-slate-700`}
      >
        {sidebar}
      </div>
      <div className={`${hasActiveChat ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>{children}</div>
    </div>
  );
}
