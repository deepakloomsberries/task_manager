import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

// 50 MB covers the vast majority of everyday attachments (docs, sheets,
// screenshots, short videos) without risking the server's memory/timeout
// budget on a modest VPS. Anything bigger (a designer's 100-500 MB source
// file) should go through "Add a link" instead — see addAttachmentLink in
// lib/actions/files.ts — rather than raising this further.
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

export async function saveUpload(file: File): Promise<{
  storedName: string;
  originalName: string;
  mimeType: string;
  size: number;
}> {
  // Random on-disk name; the original name only lives in the database, so
  // path traversal or duplicate names can never touch the filesystem.
  const ext = path.extname(file.name).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
  const storedName = crypto.randomUUID() + ext;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  // Streamed straight to disk instead of buffering the whole file in memory
  // first (file.arrayBuffer() would hold the entire upload in RAM at once) —
  // keeps peak memory roughly constant regardless of file size.
  await pipeline(Readable.fromWeb(file.stream() as never), createWriteStream(path.join(UPLOAD_DIR, storedName)));
  return {
    storedName,
    originalName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  };
}

export async function deleteUpload(storedName: string | null) {
  if (!storedName) return; // a link attachment has nothing on disk to remove
  try {
    await fs.unlink(path.join(UPLOAD_DIR, storedName));
  } catch {
    // File already gone — the DB record is the source of truth.
  }
}

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
