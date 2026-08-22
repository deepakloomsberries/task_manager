export type MentionUser = { id: number; name: string };

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a global regex matching `@<known full name>` for any of the given
 * users, trying the longest names first so "@Ravi Kumar" wins over "@Ravi".
 *
 * Group 1 is the leading boundary (start-of-text or a non-word, non-`@` char)
 * so that emails like a@b.com don't match; group 2 is the matched name. We use
 * a capture group instead of a lookbehind so it works on every browser.
 */
export function buildMentionRegex(users: MentionUser[]): RegExp | null {
  const names = users
    .map((u) => u.name.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (names.length === 0) return null;
  const alt = names.map(escapeRegExp).join("|");
  return new RegExp(`(^|[^\\w@])@(${alt})(?![\\w])`, "gi");
}

/** Returns the ids of users actually @-mentioned in the given text. */
export function findMentionedIds(text: string, users: MentionUser[]): number[] {
  const re = buildMentionRegex(users);
  if (!re) return [];
  const byName = new Map(users.map((u) => [u.name.trim().toLowerCase(), u.id]));
  const ids = new Set<number>();
  for (const m of Array.from(text.matchAll(re))) {
    const id = byName.get(m[2].trim().toLowerCase());
    if (id != null) ids.add(id);
  }
  return Array.from(ids);
}
