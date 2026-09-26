import { describe, expect, it } from "vitest";
import { kindOf } from "@/lib/fileKinds";

describe("file kinds", () => {
  it("sorts files into types by mime type or extension", () => {
    expect(kindOf("image/png", "a.png", false)).toBe("image");
    expect(kindOf("application/octet-stream", "Invoice.PDF", false)).toBe("pdf");
    expect(kindOf("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "x.xlsx", false)).toBe("sheet");
    expect(kindOf("text/csv", "x.csv", false)).toBe("sheet");
    expect(kindOf("application/octet-stream", "notes.docx", false)).toBe("doc");
    expect(kindOf("video/mp4", "clip.mp4", false)).toBe("video");
    expect(kindOf("application/zip", "all.zip", false)).toBe("archive");
    expect(kindOf("text/uri-list", "drive.google.com", true)).toBe("link");
    expect(kindOf("application/x-weird", "thing.bin", false)).toBe("other");
  });
});
