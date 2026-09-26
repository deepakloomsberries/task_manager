"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBundleDisabled } from "@/lib/actions/bundles";

export default function BundleRowActions({ id, token, disabled }: { id: number; token: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/b/${token}` : `/b/${token}`;
  return (
    <span className="flex justify-end gap-3 text-xs">
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard?.writeText(url).catch(() => window.prompt("Copy this link:", url));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-sky-700 hover:underline"
      >
        {copied ? "✓ Copied" : "Copy link"}
      </button>
      <a href={`/b/${token}`} target="_blank" rel="noreferrer" className="text-slate-500 hover:underline">
        Open
      </a>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { await setBundleDisabled(id, !disabled); router.refresh(); })}
        className={disabled ? "text-green-700 hover:underline" : "text-red-600 hover:underline"}
      >
        {disabled ? "Turn on" : "Turn off"}
      </button>
    </span>
  );
}
