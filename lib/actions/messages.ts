"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { pushNotification } from "@/lib/notify";
import { deleteUpload } from "@/lib/storage";
import { translateText } from "@/lib/ai";

/**
 * Kicks off translation of a just-created message in the background and does
 * NOT await it — translation used to run before the message was created,
 * which made every cross-language send wait ~1-2s on Gemini before the
 * bubble would even appear. Now the message is created and returned
 * immediately, and this fills in translatedBody/translatedLang moments
 * later; the chat's poll endpoint picks up the update via `translatedAt`
 * (see /api/messages/[userId]) and patches the already-rendered bubble.
 *
 * Safe to fire-and-forget here specifically because this app runs as a
 * long-lived `next start` process under systemd, not a serverless/edge
 * function that gets frozen the instant the response is sent — the event
 * loop keeps running this promise to completion regardless.
 *
 * Skipped entirely when no translation is needed (recipient has no
 * preference, or it matches the sender's) or Gemini isn't configured — the
 * chat then just shows the original body, same as before this feature.
 * Retries once on a transient failure (e.g. a rate limit blip) before
 * giving up; a genuine failure (quota exceeded, bad config, etc.) sets
 * `translationFailed` so the bubble can show a small notice instead of
 * silently staying untranslated with no explanation.
 */
function scheduleTranslation(
  messageId: number,
  body: string,
  sender: { preferredLanguage: string | null },
  recipient: { preferredLanguage: string | null }
) {
  if (!body || !recipient.preferredLanguage || recipient.preferredLanguage === sender.preferredLanguage) return;
  const targetLang = recipient.preferredLanguage;

  const attempt = (retriesLeft: number): Promise<void> =>
    translateText(body, targetLang).then((result) => {
      if (result.ok) {
        return db.directMessage
          .update({
            where: { id: messageId },
            data: { translatedBody: result.text, translatedLang: targetLang, translatedAt: new Date() },
          })
          .then(() => {});
      }
      if (retriesLeft > 0) {
        return new Promise((resolve) => setTimeout(resolve, 1500)).then(() => attempt(retriesLeft - 1));
      }
      // Out of retries. "not-configured" means the admin never set up
      // GEMINI_API_KEY — an intentional off-state, not worth flagging. Any
      // other error (quota exceeded, bad model name, network) is a real
      // failure the recipient should know about, so the bubble can show a
      // small notice instead of quietly staying untranslated.
      if (result.error !== "not-configured") {
        return db.directMessage
          .update({ where: { id: messageId }, data: { translationFailed: true, translatedAt: new Date() } })
          .then(() => {});
      }
    });

  void attempt(1).catch((e) => console.error(`[chat translate] background translation failed for message ${messageId}:`, e));
}

export async function sendDirectMessage(formData: FormData) {
  const user = await requireUser();
  const recipientId = Number(formData.get("recipientId"));
  const body = String(formData.get("body") ?? "").trim();

  if (!recipientId || recipientId === user.id) redirect("/messages");
  if (!body || body.length > 4000) redirect(`/messages/${recipientId}`);

  const recipient = await db.user.findUnique({ where: { id: recipientId } });
  if (!recipient || !recipient.active) redirect("/messages");

  const msg = await db.directMessage.create({
    data: { body, senderId: user.id, recipientId },
  });
  scheduleTranslation(msg.id, body, user, recipient);
  await pushNotification(recipientId, `${user.name} sent you a message`, `/messages/${user.id}`);

  revalidatePath(`/messages/${recipientId}`);
  revalidatePath("/messages");
  redirect(`/messages/${recipientId}`);
}

/**
 * Deletes one of your own messages for everyone. The row is kept as a tombstone
 * (so both sides can show "This message was deleted"), but its body is cleared
 * and any attachments are removed from disk and the database.
 */
export async function deleteMessage(messageId: number): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const msg = await db.directMessage.findUnique({
    where: { id: messageId },
    include: { attachments: true },
  });
  if (!msg || msg.senderId !== user.id || msg.deletedAt) return { ok: false };

  await Promise.all(msg.attachments.map((a) => deleteUpload(a.storedName)));
  await db.attachment.deleteMany({ where: { messageId } });
  await db.directMessage.update({
    where: { id: messageId },
    data: { body: "", deletedAt: new Date() },
  });

  revalidatePath("/messages");
  return { ok: true };
}

export type MessageAttachment = {
  id: number;
  name: string;
  mimeType: string;
  size: number;
};

export type ReplyPreview = {
  id: number;
  body: string;
  senderId: number;
  hasAttachment: boolean;
};

export type SentMessage = {
  id: number;
  body: string;
  senderId: number;
  recipientId: number;
  createdAt: string;
  attachments: MessageAttachment[];
  replyTo: ReplyPreview | null;
};

/**
 * Sends a direct message (optionally with already-uploaded attachments and/or
 * quoting an earlier message) and returns it so the chat UI can reconcile the
 * optimistic bubble it already drew. Unlike `sendDirectMessage`, this does not
 * redirect — the client stays put and keeps the conversation feeling live.
 */
export async function sendMessage(
  recipientId: number,
  rawBody: string,
  attachmentIds: number[] = [],
  replyToId?: number | null
): Promise<SentMessage | { error: string }> {
  const user = await requireUser();
  const body = String(rawBody ?? "").trim();
  const ids = (attachmentIds ?? []).filter((n) => Number.isFinite(n) && n > 0).slice(0, 10);

  if (!recipientId || recipientId === user.id) return { error: "invalid recipient" };
  if (!body && ids.length === 0) return { error: "empty" };
  if (body.length > 4000) return { error: "too long" };

  const recipient = await db.user.findUnique({ where: { id: recipientId } });
  if (!recipient || !recipient.active) return { error: "recipient unavailable" };

  // A reply target only counts if it's a real, non-deleted message in this
  // same conversation — otherwise silently send without the quote rather
  // than erroring the whole send over a stale/removed reference.
  let replyToRow: (ReplyPreview & { deletedAt: Date | null }) | null = null;
  if (replyToId) {
    const parent = await db.directMessage.findUnique({
      where: { id: replyToId },
      select: {
        id: true,
        body: true,
        senderId: true,
        recipientId: true,
        deletedAt: true,
        attachments: { select: { id: true }, take: 1 },
      },
    });
    if (
      parent &&
      !parent.deletedAt &&
      ((parent.senderId === user.id && parent.recipientId === recipientId) ||
        (parent.recipientId === user.id && parent.senderId === recipientId))
    ) {
      replyToRow = {
        id: parent.id,
        body: parent.body,
        senderId: parent.senderId,
        hasAttachment: parent.attachments.length > 0,
        deletedAt: null,
      };
    }
  }

  const msg = await db.directMessage.create({
    data: { body, senderId: user.id, recipientId, replyToId: replyToRow?.id ?? null },
  });
  scheduleTranslation(msg.id, body, user, recipient);

  // Link the sender's freshly uploaded, not-yet-attached files to this message.
  if (ids.length > 0) {
    await db.attachment.updateMany({
      where: { id: { in: ids }, uploadedById: user.id, messageId: null, taskId: null },
      data: { messageId: msg.id },
    });
  }
  const attachments = await db.attachment.findMany({
    where: { messageId: msg.id },
    select: { id: true, originalName: true, mimeType: true, size: true },
    orderBy: { id: "asc" },
  });

  await pushNotification(recipientId, `${user.name} sent you a message`, `/messages/${user.id}`);

  // Refresh the conversations list (unread counts / previews) without navigating.
  revalidatePath("/messages");

  return {
    id: msg.id,
    body: msg.body,
    senderId: msg.senderId,
    recipientId: msg.recipientId,
    createdAt: msg.createdAt.toISOString(),
    attachments: attachments.map((a) => ({
      id: a.id,
      name: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
    })),
    replyTo: replyToRow
      ? { id: replyToRow.id, body: replyToRow.body, senderId: replyToRow.senderId, hasAttachment: replyToRow.hasAttachment }
      : null,
  };
}

export type ReactionSummary = { emoji: string; count: number; mine: boolean };

/**
 * Tap-to-react, WhatsApp-style: picking an emoji sets/replaces your own
 * reaction on that message, picking the same one again removes it. Returns
 * the message's full reaction summary so the caller can update optimistically
 * without waiting for the next poll.
 */
export async function toggleReaction(
  messageId: number,
  emoji: string
): Promise<{ reactions: ReactionSummary[] } | { error: string }> {
  const user = await requireUser();
  const cleanEmoji = String(emoji ?? "").trim().slice(0, 8);
  if (!cleanEmoji) return { error: "invalid emoji" };

  const msg = await db.directMessage.findUnique({
    where: { id: messageId },
    select: { senderId: true, recipientId: true, deletedAt: true },
  });
  if (!msg || msg.deletedAt) return { error: "not found" };
  if (msg.senderId !== user.id && msg.recipientId !== user.id) return { error: "forbidden" };

  const existing = await db.messageReaction.findUnique({
    where: { messageId_userId: { messageId, userId: user.id } },
  });
  if (existing && existing.emoji === cleanEmoji) {
    await db.messageReaction.delete({ where: { id: existing.id } });
  } else {
    await db.messageReaction.upsert({
      where: { messageId_userId: { messageId, userId: user.id } },
      create: { messageId, userId: user.id, emoji: cleanEmoji },
      update: { emoji: cleanEmoji },
    });
  }

  const rows = await db.messageReaction.findMany({ where: { messageId } });
  const byEmoji = new Map<string, ReactionSummary>();
  for (const r of rows) {
    const cur = byEmoji.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    cur.count += 1;
    if (r.userId === user.id) cur.mine = true;
    byEmoji.set(r.emoji, cur);
  }

  const otherId = msg.senderId === user.id ? msg.recipientId : msg.senderId;
  revalidatePath(`/messages/${otherId}`);

  return { reactions: Array.from(byEmoji.values()) };
}

/**
 * Toggles a private "star" (bookmark) on a message for the current user only
 * — WhatsApp-style. Nobody else can see who starred what.
 */
export async function toggleStar(messageId: number): Promise<{ starred: boolean } | { error: string }> {
  const user = await requireUser();

  const msg = await db.directMessage.findUnique({
    where: { id: messageId },
    select: { senderId: true, recipientId: true, deletedAt: true },
  });
  if (!msg || msg.deletedAt) return { error: "not found" };
  if (msg.senderId !== user.id && msg.recipientId !== user.id) return { error: "forbidden" };

  const existing = await db.messageStar.findUnique({
    where: { messageId_userId: { messageId, userId: user.id } },
  });
  if (existing) {
    await db.messageStar.delete({ where: { id: existing.id } });
    return { starred: false };
  }
  await db.messageStar.create({ data: { messageId, userId: user.id } });
  return { starred: true };
}
