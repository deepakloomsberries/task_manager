"use client";

/** Prints the current page — the sidebar/header are hidden via print:hidden
 *  (see SidebarState.tsx and the app layout), so what comes out is just the
 *  content, suitable for handing to finance as a PDF. */
export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary print:hidden !py-1.5 text-xs">
      Print / Save as PDF
    </button>
  );
}
