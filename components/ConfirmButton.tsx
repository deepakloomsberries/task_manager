"use client";

/**
 * A submit button that asks for confirmation before the form's server action
 * runs. Cancelling prevents the submit — used for destructive actions like
 * deleting an attachment.
 */
export default function ConfirmButton({
  children,
  message = "Are you sure?",
  className = "",
  title,
}: {
  children: React.ReactNode;
  message?: string;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="submit"
      title={title}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
