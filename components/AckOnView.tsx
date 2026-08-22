"use client";

import { useEffect } from "react";

/** When the assignee opens a task they haven't acknowledged, mark it seen after
 *  ~1 second on the page — so there's a record they viewed it. Renders nothing. */
export default function AckOnView({ taskId }: { taskId: number }) {
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/tasks/${taskId}/ack`, { method: "POST", keepalive: true }).catch(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [taskId]);
  return null;
}
