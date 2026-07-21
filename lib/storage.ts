import path from "path";
import fs from "fs/promises";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

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
  await fs.writeFile(path.join(UPLOAD_DIR, storedName), Buffer.from(await file.arrayBuffer()));
  return {
    storedName,
    originalName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  };
}

export async function deleteUpload(storedName: string) {
  try {
    await fs.unlink(path.join(UPLOAD_DIR, storedName));
  } catch {
    // File already gone — the DB record is the source of truth.
  }
}

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
