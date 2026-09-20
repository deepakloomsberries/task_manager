"use server";

import { requireUser } from "@/lib/auth";
import { draftTaskFromInput, type DraftResult } from "@/lib/ai";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB — Gemini's inline-image limit has headroom below this

/** Drafts a task from pasted text and/or a pasted screenshot, via Gemini. */
export async function draftTaskFromCompose(formData: FormData): Promise<DraftResult> {
  await requireUser();

  const text = String(formData.get("text") ?? "").trim();
  const image = formData.get("image");
  const hasImage = image instanceof File && image.size > 0;
  if (!text && !hasImage) return { ok: false, error: "Paste some text or an image first." };

  let imageBase64: string | undefined;
  let imageMimeType: string | undefined;
  if (hasImage) {
    const file = image as File;
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Image is too large (max 8 MB)." };
    const buf = Buffer.from(await file.arrayBuffer());
    imageBase64 = buf.toString("base64");
    imageMimeType = file.type || "image/png";
  }

  return draftTaskFromInput({ text, imageBase64, imageMimeType });
}
