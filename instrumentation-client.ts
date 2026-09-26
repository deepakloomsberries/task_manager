// Browser error monitoring. A no-op unless NEXT_PUBLIC_SENTRY_DSN is set at build time.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  sendDefaultPii: false,
});

// Lets Sentry trace client-side navigations (a no-op while disabled).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
