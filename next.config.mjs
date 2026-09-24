import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Loads instrumentation.ts (Sentry error monitoring) on Next 14.
    instrumentationHook: true,
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
