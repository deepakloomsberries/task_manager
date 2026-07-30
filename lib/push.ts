import webpush from "web-push";
import { db } from "./db";

/**
 * Web Push delivery. This is entirely optional: if VAPID keys aren't set in the
 * environment the whole feature stays dormant (every function no-ops), so the
 * app runs fine without it. Generate keys once with:
 *
 *   npx web-push generate-vapid-keys
 *
 * then add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (and optionally VAPID_SUBJECT)
 * to .env and restart.
 */

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const rawSubject = process.env.VAPID_SUBJECT || process.env.APP_URL || "admin@loomsberries.com";
const subject = /^(https?:|mailto:)/.test(rawSubject) ? rawSubject : `mailto:${rawSubject}`;

let configured = false;

/** True when VAPID keys are present; lazily wires up web-push on first use. */
export function pushConfigured() {
  if (!publicKey || !privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
  return true;
}

/** The public VAPID key browsers need to subscribe, or null when disabled. */
export function vapidPublicKey() {
  return publicKey ?? null;
}

export type PushPayload = { title: string; body: string; url?: string };

/** Sends a push to every device a user has registered. Prunes dead endpoints. */
export async function sendPushToUser(userId: number, payload: PushPayload) {
  if (!pushConfigured()) return;

  const subs = await db.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        // 404/410 mean the browser dropped the subscription — clean it up.
        if (code === 404 || code === 410) {
          await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        }
      }
    })
  );
}
