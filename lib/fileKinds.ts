/** File types for Documents icons, previews and the "Type" filter. Safe on server and client. */
export type FileKind = "image" | "pdf" | "sheet" | "doc" | "video" | "audio" | "text" | "archive" | "link" | "other";

export const KIND_META: Record<FileKind, { icon: string; label: string }> = {
  image: { icon: "🖼", label: "Images" },
  pdf: { icon: "📕", label: "PDFs" },
  sheet: { icon: "📊", label: "Spreadsheets" },
  doc: { icon: "📝", label: "Documents" },
  video: { icon: "🎬", label: "Videos" },
  audio: { icon: "🎵", label: "Audio" },
  text: { icon: "📄", label: "Text" },
  archive: { icon: "🗜", label: "Zips" },
  link: { icon: "🔗", label: "Links" },
  other: { icon: "📎", label: "Other" },
};

const ext = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1] ?? "");

export function kindOf(mimeType: string, name: string, isLink: boolean): FileKind {
  if (isLink) return "link";
  const m = mimeType.toLowerCase();
  const e = ext(name);
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf" || e === "pdf") return "pdf";
  if (/spreadsheet|excel|csv/.test(m) || ["xlsx", "xls", "csv", "ods", "xlsm"].includes(e)) return "sheet";
  if (/word|opendocument\.text|rtf|presentation|powerpoint/.test(m) || ["doc", "docx", "odt", "rtf", "ppt", "pptx"].includes(e)) return "doc";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (/zip|rar|7z|tar|gzip/.test(m) || ["zip", "rar", "7z", "gz"].includes(e)) return "archive";
  if (m.startsWith("text/") || ["txt", "xml", "json", "md"].includes(e)) return "text";
  return "other";
}

/** Can the browser show it in the in-app preview? */
export const PREVIEWABLE: FileKind[] = ["image", "pdf", "video", "audio", "text"];
