"use client";

import { useEffect } from "react";

/** A styled in-app confirmation dialog. Controlled via `open`. */
export default function ConfirmDialog({
  open,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-xl dark:bg-red-950/50">
            ⚠️
          </span>
          <p className="pt-1.5 text-sm text-slate-700 dark:text-slate-200">{message}</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary !py-1.5 text-sm">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="btn-danger !py-1.5 text-sm">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
