"use client";

import { useState, useTransition } from "react";
import Modal from "./Modal";

/** "New folder" / "Rename" — one text box and a button. */
export default function PromptDialog({
  title,
  label,
  initial = "",
  action,
  onClose,
  submitLabel = "Save",
}: {
  title: string;
  label: string;
  initial?: string;
  action: (value: string) => Promise<{ ok: boolean; error?: string }>;
  onClose: (changed: boolean) => void;
  submitLabel?: string;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Modal title={title} onClose={() => onClose(false)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await action(value);
            if (r.ok) onClose(true);
            else setError(r.error ?? "Something went wrong.");
          });
        }}
        className="space-y-3"
      >
        <label className="label" htmlFor="prompt-value">
          {label}
        </label>
        <input id="prompt-value" autoFocus value={value} onChange={(e) => setValue(e.target.value)} className="input" required maxLength={200} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onClose(false)} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn-primary">
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
