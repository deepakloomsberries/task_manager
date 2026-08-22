"use client";

import { deleteUser } from "@/lib/actions/users";

/** Hard-delete action for a mistakenly-created account. Only rendered for users
 *  that never logged in and own no data; still asks for confirmation because
 *  the delete is permanent. */
export default function DeleteUserButton({
  id,
  name,
  redirectTo,
  className = "text-red-600 hover:underline",
  label = "Delete",
}: {
  id: number;
  name: string;
  redirectTo?: string;
  className?: string;
  label?: string;
}) {
  return (
    <form
      action={deleteUser}
      onSubmit={(e) => {
        if (
          !confirm(
            `Permanently delete "${name}"?\n\nThis can't be undone. It's only allowed because this account never logged in and has no tasks, time, or other data.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
