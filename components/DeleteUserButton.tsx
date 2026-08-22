"use client";

import { deleteUser } from "@/lib/actions/users";

/** Hard-delete action for a mistakenly-created account. Only rendered for users
 *  that never logged in and own no data; still asks for confirmation because
 *  the delete is permanent. */
export default function DeleteUserButton({ id, name }: { id: number; name: string }) {
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
      <button type="submit" className="text-red-600 hover:underline">
        Delete
      </button>
    </form>
  );
}
