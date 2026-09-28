"use client";

import { useState, useTransition } from "react";
import { toggleProjectStar } from "@/lib/actions/projects";

/** Pin a project to the top of your Projects page. */
export default function ProjectStar({ id, starred }: { id: number; starred: boolean }) {
  const [on, setOn] = useState(starred);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOn((v) => !v);
          const r = await toggleProjectStar(id);
          if (r.ok) setOn(r.starred);
        })
      }
      className={`relative z-10 rounded p-0.5 text-lg leading-none transition ${on ? "text-amber-400" : "text-slate-300 hover:text-amber-400 dark:text-slate-600"}`}
      title={on ? "Unpin" : "Pin to top"}
      aria-label={on ? "Unpin project" : "Pin project"}
      aria-pressed={on}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
