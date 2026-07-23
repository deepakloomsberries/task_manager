"use client";

import { useState } from "react";

/** Share a task by WhatsApp, or copy its link / ID to the clipboard. */
export default function ShareTask({
  code,
  title,
  taskId,
}: {
  code: string;
  title: string;
  taskId: number;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  function taskUrl() {
    if (typeof window !== "undefined") return `${window.location.origin}/tasks/${taskId}`;
    return `/tasks/${taskId}`;
  }

  function shareWhatsApp() {
    const text = `${code}: ${title}\n${taskUrl()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  return (
    <details className="relative">
      <summary className="btn-secondary cursor-pointer list-none">Share</summary>
      <div className="absolute right-0 top-11 z-10 w-52 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
        <button
          type="button"
          onClick={shareWhatsApp}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50"
        >
          <span className="text-green-600">◆</span> Share on WhatsApp
        </button>
        <button
          type="button"
          onClick={() => copy(taskUrl(), "link")}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50"
        >
          <span className="text-slate-400">🔗</span>
          {copied === "link" ? "Link copied!" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={() => copy(code, "id")}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50"
        >
          <span className="font-mono text-xs text-slate-400">#</span>
          {copied === "id" ? "ID copied!" : `Copy ID (${code})`}
        </button>
      </div>
    </details>
  );
}
