"use client";

/**
 * Last-resort fallback for an error thrown in the root layout itself (rare —
 * app/error.tsx handles everything else). This replaces the whole document,
 * so it can't rely on globals.css having loaded; styles are inlined.
 */
export default function GlobalError() {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#f8fafc" }}>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div
            style={{
              maxWidth: 420,
              textAlign: "center",
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 32,
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
            <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "#0f172a" }}>
              Looms &amp; Berries Tasks hit a problem
            </h1>
            <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24 }}>
              Something broke loading the app shell. Reloading almost always fixes this.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: "#0284c7",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
