import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standard browser hardening on every response.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Only ever load this site over HTTPS (the domain is always served via Apache + TLS).
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Nobody else may put the app inside a frame (clickjacking).
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Links out of the app don't leak internal URLs (task ids, filters).
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Video calls run on Jitsi's own site, so this app never needs the camera itself.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // File uploads go through server actions; allow up to 55 MB bodies
      // (attachments themselves are capped at 50 MB in lib/storage.ts —
      // this just needs a little headroom above that for the rest of the
      // multipart request).
      bodySizeLimit: "55mb",
    },
  },
};

// Error monitoring is inert until SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN are set.
// Source maps are only uploaded when SENTRY_AUTH_TOKEN (+ org/project) is too.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  telemetry: false,
});
