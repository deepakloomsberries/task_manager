"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "off-server" | "granted" | "denied" | "default";

/** Shows whether this browser gets pop-up notifications, with a button to turn them on. */
export default function PushStatus() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      const res = await fetch("/api/push/vapid").catch(() => null);
      const key = res?.ok ? (await res.json()).key : null;
      if (!key) return setState("off-server");
      setState(Notification.permission as State);
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        const { key } = await (await fetch("/api/push/vapid")).json();
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
        await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
        try {
          localStorage.removeItem("pushPromptDismissed");
        } catch {
          /* ignore */
        }
      }
      setState(permission as State);
    } finally {
      setBusy(false);
    }
  }

  const row = (dot: string, text: string, extra?: React.ReactNode) => (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        {text}
      </span>
      {extra}
    </div>
  );

  switch (state) {
    case "loading":
      return row("bg-slate-300", "Checking this browser…");
    case "unsupported":
      return row("bg-slate-300", "This browser can't show pop-up notifications. On iPhone, add the app to your Home Screen first.");
    case "off-server":
      return row("bg-slate-300", "Pop-up notifications aren't set up on the server yet.");
    case "granted":
      return row("bg-emerald-500", "On for this browser");
    case "denied":
      return row("bg-red-500", "Blocked — allow notifications for this site in your browser's settings (🔒 next to the address).");
    default:
      return row(
        "bg-amber-500",
        "Off for this browser",
        <button type="button" onClick={enable} disabled={busy} className="btn-primary !py-1.5 text-xs disabled:opacity-50">
          {busy ? "Turning on…" : "Turn on"}
        </button>
      );
  }
}
