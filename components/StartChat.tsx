"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StartChat({ users }: { users: { id: number; name: string }[] }) {
  const router = useRouter();
  const [to, setTo] = useState("");

  return (
    <div className="flex gap-2">
      <select
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="input"
      >
        <option value="" disabled>
          Choose a person…
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!to}
        onClick={() => to && router.push(`/messages/${to}`)}
        className="btn-primary disabled:opacity-50"
      >
        Chat
      </button>
    </div>
  );
}
