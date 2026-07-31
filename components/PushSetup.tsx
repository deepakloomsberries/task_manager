"use client";

import { useCallback, useEffect, useState } from "react";

/** VAPID keys arrive base64url-encoded; the browser needs a Uint8Array. */
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Handles Web Push opt-in. When the browser has already granted permission it
 * quietly (re)subscribes on every load so the server always has a live endpoint.
 * When permission hasn't been decided yet it shows a small, dismissible prompt.
 * Renders nothing at all when push is unsupported or disabled server-side.
 */
export default function PushSetup() {
  const [prompt, setPrompt] = useState(false);
  const [busy, setBusy] = useState(false);

  const subscribe = useCallback(async (key: string) => {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
  }, []);

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    if (!supported) return;
    if (localStorage.getItem("pushPromptDismissed") === "1" && Notification.permission === "default") {
      return;
    }

    let cancelled = false;
    (async () => {
      const res = await fetch("/api/push/vapid").catch(() => null);
      if (!res || !res.ok || cancelled) return;
      const { key } = await res.json();
      if (!key || cancelled) return; // push disabled on the server

      if (Notification.permission === "granted") {
        subscribe(key).catch(() => {});
      } else if (Notification.permission === "default") {
        setPrompt(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [subscribe]);

  const enable = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        const res = await fetch("/api/push/vapid");
        const { key } = await res.json();
        if (key) await subscribe(key);
      }
    } catch {
      /* ignore — user can retry from settings later */
    } finally {
      setBusy(false);
      setPrompt(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem("pushPromptDismissed", "1");
    setPrompt(false);
  };

  if (!prompt) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">🔔</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Turn on notifications</div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Get alerts for new messages, assignments and reminders even when the app is closed.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={enable} disabled={busy} className="btn-primary !py-1.5 text-xs disabled:opacity-50">
              {busy ? "Enabling…" : "Enable"}
            </button>
            <button onClick={dismiss} className="btn-secondary !py-1.5 text-xs">
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
