import path from "path";
import fs from "fs/promises";
import { NextResponse } from "next/server";
import { UPLOAD_DIR } from "@/lib/storage";

/**
 * Types a browser may show inline. Everything else (HTML, SVG, scripts, office
 * files…) is always downloaded, so an uploaded file can never run as a page
 * on this site — important now that clients can upload too.
 */
const INLINE = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|application\/pdf|video\/(mp4|webm|quicktime)|audio\/[\w.+-]+|text\/plain)$/i;

export function canShowInline(mimeType: string) {
  return INLINE.test(mimeType);
}

/** Streams a stored attachment back, with safe headers. */
export async function sendAttachment(
  a: { storedName: string | null; originalName: string; mimeType: string; size: number; externalUrl: string | null },
  download: boolean
) {
  if (!a.storedName) {
    return a.externalUrl ? NextResponse.redirect(a.externalUrl) : new NextResponse("Not found", { status: 404 });
  }
  let data: Buffer;
  try {
    data = await fs.readFile(path.join(UPLOAD_DIR, a.storedName));
  } catch {
    return new NextResponse("File missing on disk", { status: 404 });
  }
  const inline = !download && canShowInline(a.mimeType);
  const safeName = a.originalName.replace(/[^\w.\- ()]/g, "_");
  const headers: Record<string, string> = {
    "Content-Type": inline ? a.mimeType : "application/octet-stream",
    "Content-Length": String(a.size),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(a.originalName)}`,
    "X-Content-Type-Options": "nosniff",
  };
  // PDFs need the browser's viewer (a sandbox would block it); nothing else needs scripts.
  if (a.mimeType.toLowerCase() !== "application/pdf") headers["Content-Security-Policy"] = "sandbox";
  return new NextResponse(new Uint8Array(data), { headers });
}
