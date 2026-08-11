"use client";

import { useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";

/**
 * A submit button that opens a styled in-app confirmation dialog before the
 * form's server action runs — replacing the browser's native confirm(). On
 * confirm it submits the surrounding form; cancelling does nothing.
 */
export default function ConfirmButton({
  children,
  message = "Are you sure?",
  confirmLabel = "Delete",
  className = "",
  title,
}: {
  children: React.ReactNode;
  message?: string;
  confirmLabel?: string;
  className?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={btnRef} type="button" title={title} className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <ConfirmDialog
        open={open}
        message={message}
        confirmLabel={confirmLabel}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          const form = btnRef.current?.form;
          setOpen(false);
          form?.requestSubmit();
        }}
      />
    </>
  );
}
