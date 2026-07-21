/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // File uploads go through server actions; allow up to 25 MB bodies
      // (attachments themselves are capped at 20 MB in lib/storage.ts).
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
