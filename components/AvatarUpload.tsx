"use client";

import { useRef, useState } from "react";
import { updateAvatar } from "@/lib/actions/profile";
import UserAvatar from "@/components/UserAvatar";

const OUT_SIZE = 512; // final square avatar, in px

/**
 * Loads the chosen image, center-crops it to a square and scales it to a fixed
 * size on a canvas before uploading. This guarantees every profile picture is
 * square, so it always fits the circular avatar frame the same way everywhere —
 * no stretching, no awkward cropping surprises. Falls back to a plain upload if
 * the browser can't decode the file.
 */
export default function AvatarUpload({
  user,
  size = 72,
  compact = false,
}: {
  user: { id: number; name: string; avatarPath?: string | null };
  size?: number;
  /** Just the avatar (click / drop to change); Save / Cancel appear after picking. */
  compact?: boolean;
}) {
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Please choose an image under 5 MB.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const side = Math.min(bitmap.width, bitmap.height);
      const sx = (bitmap.width - side) / 2;
      const sy = (bitmap.height - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = OUT_SIZE;
      canvas.height = OUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.fillStyle = "#ffffff"; // flatten any transparency to white
      ctx.fillRect(0, 0, OUT_SIZE, OUT_SIZE);
      ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUT_SIZE, OUT_SIZE);
      bitmap.close?.();
      const out: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.9)
      );
      setBlob(out);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(out);
      });
    } catch {
      // Browser couldn't decode it — fall back to sending the original file.
      setBlob(file);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    }
  }

  async function submit() {
    if (!blob) {
      setError("Choose a photo first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("avatar", new File([blob], "avatar.jpg", { type: blob.type || "image/jpeg" }));
      await updateAvatar(fd); // redirects to /settings?ok=1 on success
    } catch (e) {
      // A redirect throws a special signal that Next handles — anything else is a real error.
      if (e && typeof e === "object" && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) {
        return;
      }
      setError("Upload failed. Please try again.");
      setBusy(false);
    }
  }

  function cancel() {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setBlob(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void onPick(f);
        }}
        className={`group relative shrink-0 rounded-full ${drag ? "ring-4 ring-sky-400" : ""}`}
        title="Change photo — click or drop an image"
        aria-label="Change profile photo"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Preview" className="rounded-full object-cover ring-2 ring-sky-300" style={{ width: size, height: size }} />
        ) : (
          <UserAvatar user={user} size={size} />
        )}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          📷 Change
        </span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPick(f);
        }}
      />
      {!compact && (
        <div className="space-y-2">
          {preview ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={submit} disabled={busy} className="btn-primary !py-1.5 text-sm disabled:opacity-50">
                {busy ? "Saving…" : "Save photo"}
              </button>
              <button type="button" onClick={cancel} disabled={busy} className="btn-secondary !py-1.5 text-sm">
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary !py-1.5 text-sm">
              {user.avatarPath ? "Change photo" : "Upload photo"}
            </button>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <p className="text-xs text-slate-400">Click or drop an image · JPG, PNG or GIF up to 5 MB · cropped to a square.</p>
        </div>
      )}
      {compact && (preview || error) && (
        <div className="space-y-1">
          {preview && (
            <div className="flex gap-2">
              <button type="button" onClick={submit} disabled={busy} className="btn-primary !px-2.5 !py-1 text-xs disabled:opacity-50">
                {busy ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={cancel} disabled={busy} className="btn-secondary !px-2.5 !py-1 text-xs">
                Cancel
              </button>
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
