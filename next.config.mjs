/** @type {import('next').NextConfig} */
const nextConfig = {
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

export default nextConfig;
