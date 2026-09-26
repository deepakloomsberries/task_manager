"use client";

import { useState } from "react";
import { linkQr } from "@/lib/actions/sharing";

/** Shows a QR code for a link (to print on a sample tag, or scan from a screen). */
export default function QrButton({ url }: { url: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="btn-secondary" onClick={async () => setSvg(svg ? null : await linkQr(url))}>
        {svg ? "Hide QR" : "QR code"}
      </button>
      {svg && (
        <div className="w-full">
          <div className="inline-block rounded-lg bg-white p-2 ring-1 ring-slate-200" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="text-xs text-slate-400">Right-click → Save image, or scan with a phone camera.</p>
        </div>
      )}
    </>
  );
}
