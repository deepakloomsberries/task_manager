/**
 * Checklist notes are stored in the note's `body` as one item per line, each
 * prefixed with `[x] ` (done) or `[ ] ` (open) — so they ride on the existing
 * note storage and autosave with no extra table.
 */
export type ChecklistItem = { text: string; done: boolean };

const LINE = /^\s*\[([ xX])\]\s?(.*)$/;

export function parseChecklist(body: string): ChecklistItem[] {
  if (!body) return [];
  return body.split("\n").map((line) => {
    const m = line.match(LINE);
    if (m) return { text: m[2], done: m[1].toLowerCase() === "x" };
    return { text: line, done: false };
  });
}

export function serializeChecklist(items: ChecklistItem[]): string {
  return items
    .filter((it) => it.text.trim() !== "")
    .map((it) => `[${it.done ? "x" : " "}] ${it.text}`)
    .join("\n");
}
