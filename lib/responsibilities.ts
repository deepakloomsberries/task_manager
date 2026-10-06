/** Responsibilities are stored as plain text, one item per line. */

export const MAX_RESPONSIBILITIES = 20;
export const MAX_RESPONSIBILITY_LENGTH = 200;

/** Splits stored text into items: trims, drops bullets/numbering and blanks. */
export function parseResponsibilities(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

/** Cleans form input for storage — de-duplicated, capped. Null when empty. */
export function normalizeResponsibilities(raw: string | null | undefined): string | null {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const item of parseResponsibilities(raw)) {
    const clipped = item.slice(0, MAX_RESPONSIBILITY_LENGTH);
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(clipped);
    if (items.length >= MAX_RESPONSIBILITIES) break;
  }
  return items.length ? items.join("\n") : null;
}
