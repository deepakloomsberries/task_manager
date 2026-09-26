import type { Prisma } from "@prisma/client";

/** Prisma filters for the Documents "Type" dropdown (matches lib/fileKinds). */
export function typeWhere(type: string): Prisma.AttachmentWhereInput | null {
  const name = (...exts: string[]) => exts.map((e) => ({ originalName: { endsWith: `.${e}`, mode: "insensitive" as const } }));
  const mime = (...parts: string[]) => parts.map((p) => ({ mimeType: { contains: p, mode: "insensitive" as const } }));
  switch (type) {
    case "image":
      return { storedName: { not: null }, mimeType: { startsWith: "image/" } };
    case "pdf":
      return { storedName: { not: null }, OR: [{ mimeType: "application/pdf" }, ...name("pdf")] };
    case "sheet":
      return { storedName: { not: null }, OR: [...mime("spreadsheet", "excel", "csv"), ...name("xlsx", "xls", "csv", "ods", "xlsm")] };
    case "doc":
      return { storedName: { not: null }, OR: [...mime("word", "presentation", "powerpoint"), ...name("doc", "docx", "odt", "rtf", "ppt", "pptx")] };
    case "video":
      return { storedName: { not: null }, mimeType: { startsWith: "video/" } };
    case "link":
      return { storedName: null };
    default:
      return null;
  }
}

export const SORTS = {
  date: "createdAt",
  name: "originalName",
  size: "size",
} as const;
export const PAGE_SIZE = 50;
