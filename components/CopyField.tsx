"use client";

import { useState } from "react";

/** A read-only text field with a Copy button. */
export default function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} aria-label={label} className="input min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn-secondary shrink-0 !py-1.5 text-xs"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked — the field is selectable */
          }
        }}
      >
        {copied ? "✓ Copied" : "Copy"}
      </button>
    </div>
  );
}
