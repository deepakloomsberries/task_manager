/**
 * Ephemeral "is typing…" tracking. Typing pings happen constantly while someone
 * writes, so we keep them in process memory rather than hammering the database —
 * this is throwaway, best-effort state on a single-instance server. Entries live
 * only a few seconds and are cleaned up lazily.
 */

const TYPING_TTL_MS = 6000;

// Survive dev hot-reloads the same way lib/db.ts keeps one Prisma client.
const globalForTyping = globalThis as unknown as { typingMap?: Map<string, number> };
const typing = globalForTyping.typingMap ?? new Map<string, number>();
globalForTyping.typingMap = typing;

const key = (fromId: number, toId: number) => `${fromId}:${toId}`;

/** Record that `fromId` is currently typing a message to `toId`. */
export function setTyping(fromId: number, toId: number) {
  typing.set(key(fromId, toId), Date.now());
  // Opportunistic cleanup so the map can't grow unbounded.
  if (typing.size > 500) {
    const now = Date.now();
    typing.forEach((t, k) => {
      if (now - t > TYPING_TTL_MS) typing.delete(k);
    });
  }
}

/** Whether `fromId` was typing to `toId` within the last few seconds. */
export function isTyping(fromId: number, toId: number) {
  const t = typing.get(key(fromId, toId));
  if (!t) return false;
  if (Date.now() - t > TYPING_TTL_MS) {
    typing.delete(key(fromId, toId));
    return false;
  }
  return true;
}
