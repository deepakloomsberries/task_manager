import React from "react";
import { buildMentionRegex, type MentionUser } from "@/lib/mentions";

/**
 * Renders message/comment text with @mentions highlighted as chips and bare
 * URLs turned into links. Pure and hook-free, so it works in both server
 * components (task comments) and client components (live discussion).
 */
export function renderRich(
  text: string,
  users: MentionUser[],
  opts: { mine?: boolean } = {}
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let key = 0;

  const pushPlain = (s: string) => {
    for (const part of s.split(/(https?:\/\/[^\s]+)/g)) {
      if (!part) continue;
      if (/^https?:\/\//.test(part)) {
        nodes.push(
          <a
            key={key++}
            href={part}
            target="_blank"
            rel="noreferrer"
            className={`underline ${opts.mine ? "text-white" : "text-sky-600"}`}
          >
            {part}
          </a>
        );
      } else {
        nodes.push(<React.Fragment key={key++}>{part}</React.Fragment>);
      }
    }
  };

  const re = buildMentionRegex(users);
  if (!re) {
    pushPlain(text);
    return nodes;
  }

  let last = 0;
  for (const m of Array.from(text.matchAll(re))) {
    const idx = m.index ?? 0;
    const lead = m[1] ?? ""; // start-of-text or a boundary char before the "@"
    const mentionStart = idx + lead.length;
    if (mentionStart > last) pushPlain(text.slice(last, mentionStart));
    nodes.push(
      <span
        key={key++}
        className={`rounded px-1 font-medium ${
          opts.mine ? "bg-white/25 text-white" : "bg-sky-100 text-sky-700"
        }`}
      >
        @{m[2]}
      </span>
    );
    last = idx + m[0].length;
  }
  if (last < text.length) pushPlain(text.slice(last));
  return nodes;
}
